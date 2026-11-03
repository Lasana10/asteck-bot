import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const sql=readFileSync('supabase/migrations/20261021100000_afat_private_visual_field_review.sql','utf8');
assert.match(sql,/drop policy if exists afat_field_evidence_read_own_or_review on storage\.objects/i);
assert.match(sql,/create policy afat_field_evidence_read_own_or_review/i);
assert.match(sql,/bucket_id='afat-field-evidence'/);
assert.match(sql,/auth\.uid\(\)::text/);
assert.match(sql,/afat_has_permission\('map\.evidence\.review'\)/);
assert.doesNotMatch(sql,/planning\.aggregate\.view/);
const mapper=readFileSync('dashboard/src/components/shared/FieldMapper.tsx','utf8');
const queue=readFileSync('dashboard/src/services/fieldMappingQueue.ts','utf8');
for(const token of [
  'cameraFacing:photo?cameraFacing:null',
  'Photo camera facing direction',
  'not sensor-verified visual positioning',
]) assert.ok(mapper.includes(token),'visual field capture: '+token);
for(const token of [
  "cameraFacing?:string|null",
  "photo_camera_facing_reported",
  "camera_direction_source:item.photo?'observer_reported':null",
  'camera_orientation_verified:false',
  'automatic_visual_position_verified:false',
  'Camera orientation requires a consented photo',
]) assert.ok(queue.includes(token),'private visual orientation custody: '+token);
console.log('AFAT private visual field evidence: owner and authorized-reviewer policy contract passed');
