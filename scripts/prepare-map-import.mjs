#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const scalarPropertyKeys = [
  'brand', 'category', 'class', 'confidence', 'country', 'locality', 'region',
  'subtype', 'type', 'website', 'wikidata',
];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nameFromProperties(properties = {}) {
  return text(properties.name)
    || text(properties.canonical_name)
    || text(properties.names?.primary)
    || text(properties.names?.common?.[0]?.value);
}

function aliasesFromProperties(properties = {}) {
  const candidates = [
    ...(Array.isArray(properties.aliases) ? properties.aliases : []),
    ...(Array.isArray(properties.alt_names) ? properties.alt_names : []),
    ...(Array.isArray(properties.names?.common) ? properties.names.common.map((entry) => entry?.value) : []),
  ];
  return [...new Set(candidates.map(text).filter(Boolean))].slice(0, 20);
}

function categoryFromProperties(properties = {}) {
  return text(properties.category)
    || text(properties.categories?.primary)
    || text(properties.level6_category_name)
    || text(properties.class)
    || text(properties.type)
    || undefined;
}

function curatedProperties(properties = {}) {
  const result = {};
  for (const key of scalarPropertyKeys) {
    const value = properties[key];
    if (['string', 'number', 'boolean'].includes(typeof value) || value === null) {
      result[key] = typeof value === 'string' ? value.slice(0, 500) : value;
    }
  }
  return result;
}

function pointCoordinates(feature) {
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;
  const [longitude, latitude] = feature.geometry.coordinates.map(Number);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function contains(bbox, point) {
  return point.longitude >= bbox.west && point.longitude <= bbox.east
    && point.latitude >= bbox.south && point.latitude <= bbox.north;
}

export function prepareImportPayload({ geojson, sourceKey, datasetVersion, scopeLabel, bbox, dryRun = true, contentSha256 }) {
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Input must be a GeoJSON FeatureCollection.');
  }
  if (!/^[a-z0-9][a-z0-9_]{1,62}$/.test(sourceKey || '')) throw new Error('A valid configured source key is required.');
  if (!datasetVersion || !scopeLabel) throw new Error('Dataset version and scope label are required.');
  if (!bbox || bbox.west >= bbox.east || bbox.south >= bbox.north) throw new Error('A valid bounding box is required.');
  if (bbox.east - bbox.west > 1.5 || bbox.north - bbox.south > 1.5) {
    throw new Error('Pilot imports must use a bounding box no larger than 1.5 degrees per side.');
  }

  const skipped = [];
  const features = [];
  for (const [index, feature] of geojson.features.entries()) {
    const properties = feature?.properties || {};
    const coordinates = pointCoordinates(feature);
    if (!coordinates) {
      skipped.push({ index, reason: 'Only Point features are accepted by the Place candidate importer.' });
      continue;
    }
    if (!contains(bbox, coordinates)) {
      skipped.push({ index, reason: 'Feature is outside the declared bounding box.' });
      continue;
    }
    const name = nameFromProperties(properties);
    const externalId = text(feature.id)
      || text(properties.id)
      || text(properties.fsq_place_id)
      || text(properties.osm_id);
    if (!name || !externalId) {
      skipped.push({ index, reason: 'Feature requires a stable external ID and a name.' });
      continue;
    }
    features.push({
      externalId,
      name,
      aliases: aliasesFromProperties(properties),
      category: categoryFromProperties(properties),
      address: text(properties.address) || text(properties.formatted_address) || undefined,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      confidence: typeof properties.confidence === 'number'
        ? Math.max(0, Math.min(1, properties.confidence))
        : undefined,
      properties: curatedProperties(properties),
    });
  }
  if (!features.length) throw new Error('No importable Point features remained after validation.');
  if (features.length > 500) throw new Error('A prepared API batch may contain at most 500 features. Split the input first.');

  return {
    payload: {
      sourceKey,
      datasetVersion,
      scopeLabel,
      bbox,
      dryRun,
      contentSha256,
      features,
    },
    report: {
      input_count: geojson.features.length,
      prepared_count: features.length,
      skipped_count: skipped.length,
      skipped: skipped.slice(0, 50),
    },
  };
}

function argumentsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const next = argv[index + 1];
    values[key.slice(2)] = next && !next.startsWith('--') ? argv[++index] : true;
  }
  return values;
}

function parseBbox(value) {
  const [west, south, east, north] = String(value || '').split(',').map(Number);
  return { west, south, east, north };
}

function run() {
  const args = argumentsFrom(process.argv.slice(2));
  if (!args.input || !args.source || !args.version || !args.scope || !args.bbox || !args.output) {
    throw new Error('Usage: node scripts/prepare-map-import.mjs --input places.geojson --source overture_maps --version 2026-06-17.0 --scope "Yaounde pilot" --bbox 11.40,3.75,11.62,3.95 --output import.json [--apply]');
  }
  const raw = readFileSync(String(args.input));
  const prepared = prepareImportPayload({
    geojson: JSON.parse(raw.toString('utf8')),
    sourceKey: String(args.source),
    datasetVersion: String(args.version),
    scopeLabel: String(args.scope),
    bbox: parseBbox(args.bbox),
    dryRun: args.apply !== true,
    contentSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  });
  writeFileSync(String(args.output), `${JSON.stringify(prepared.payload, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(prepared.report, null, 2)}\n`);
  process.stdout.write(`Prepared ${prepared.payload.dryRun ? 'dry-run' : 'apply'} request: ${args.output}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
