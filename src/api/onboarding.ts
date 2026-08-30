/**
 * AFAT OS — Onboarding & Registration System
 * Handles: Driver registration, Vehicle registration, Passenger registration
 * Contractor agreements, Commission percentages, Fatigue tracking
 */

import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { aiRouter } from '../services/AIRouter';
import { getAuthProfileByToken, requireAuthRole } from './routes';

const router = express.Router();

function normalizeCameroonPhone(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('237')) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith('6')) return `+237${digits}`;
  return String(phone || '').trim();
}

function normalizeOptionalText(value: any) {
  const text = String(value ?? '').trim();
  return text || null;
}

function deriveOperatorApplicationStatus(intakeStatus: string) {
  if (intakeStatus === 'verification_ready') return 'UNDER_REVIEW';
  if (intakeStatus === 'partial_documents') return 'DOCUMENTS_PENDING';
  return 'APPLICATION_STARTED';
}

function isOperatorApproved(profile: any) {
  return String(profile?.operator_application_status || '').toUpperCase() === 'APPROVED';
}

async function getOptionalAuthUser(req: Request) {
  const { auth } = await getAuthProfileByToken(req);
  if (!auth?.sub) return null;
  return { id: String(auth.sub), email: auth.email ? String(auth.email) : null };
}

function requireOnboardingAuth(authUser: { id: string; email: string | null } | null, res: Response) {
  if (authUser?.id) return true;
  res.status(401).json({
    error: 'Sign in before registration so AFAT can attach this intake to your verified account.',
    code: 'AUTH_REQUIRED_FOR_ONBOARDING',
  });
  return false;
}

function canResumeProfile(existing: any, authUser: { id: string } | null) {
  return Boolean(existing && authUser?.id && existing.id === authUser.id);
}

async function findExistingProfile(params: { authUserId?: string; phone?: string }) {
  if (params.authUserId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', params.authUserId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (params.phone) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', params.phone)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

async function seedComplianceRecords(records: Array<Record<string, any>>) {
  if (!records.length) return;
  const { error } = await supabase.from('compliance_records').insert(records);
  if (error) {
    console.error('Compliance seeding error:', error);
  }
}

function buildOperatorComplianceRecords(params: {
  profileId: string;
  vehicleType?: string | null;
  baseCity?: string | null;
  operatingZone?: string | null;
  affiliationName?: string | null;
  verificationStatus?: string;
}) {
  const notes = [
    params.baseCity ? `base_city=${params.baseCity}` : null,
    params.operatingZone ? `operating_zone=${params.operatingZone}` : null,
    params.affiliationName ? `affiliation=${params.affiliationName}` : null,
    params.vehicleType ? `vehicle_type=${params.vehicleType}` : null,
  ].filter(Boolean).join(' | ');

  const vehicleDocs = params.vehicleType === 'moto' || params.vehicleType === 'bike'
    ? [
        { document_type: 'helmet_compliance', document_label: 'Helmet and rider safety check' },
        { document_type: 'bike_registration', document_label: 'Bike registration or ownership proof' },
      ]
    : [
        { document_type: 'vehicle_registration', document_label: 'Vehicle registration card' },
        { document_type: 'insurance', document_label: 'Insurance certificate' },
      ];

  const baseRecords = [
    { document_type: 'national_id', document_label: 'National ID verification' },
    { document_type: 'license', document_label: 'Driver license verification' },
    ...vehicleDocs,
  ];

  return baseRecords.map((record) => ({
    profile_id: params.profileId,
    role: params.vehicleType === 'moto' ? 'bike_rider' : 'operator',
    document_type: record.document_type,
    document_label: record.document_label,
    package_tier: params.vehicleType === 'delivery' ? 'delivery_plus' : 'core_operator',
    status: params.verificationStatus === 'verified' ? 'submitted' : 'pending',
    followup_channel: 'whatsapp',
    notes: notes || null,
  }));
}

function buildCompanyComplianceRecords(params: {
  companyId: string;
  serviceCoverage?: string | null;
  companyType?: string | null;
  companyNotes?: string | null;
}) {
  const notes = [
    params.companyType ? `company_type=${params.companyType}` : null,
    params.serviceCoverage ? `service_coverage=${params.serviceCoverage}` : null,
    params.companyNotes ? `ops_notes=${params.companyNotes}` : null,
  ].filter(Boolean).join(' | ');

  return [
    { document_type: 'business_registration', document_label: 'Business registration certificate' },
    { document_type: 'operating_permit', document_label: 'Operating permit or route authorization' },
    { document_type: 'fleet_insurance', document_label: 'Fleet insurance proof' },
    { document_type: 'tax_compliance', document_label: 'Tax or municipal compliance proof' },
  ].map((record) => ({
    company_id: params.companyId,
    role: 'company',
    document_type: record.document_type,
    document_label: record.document_label,
    package_tier: 'fleet_launch',
    status: 'pending',
    followup_channel: 'manual',
    notes: notes || null,
  }));
}

// ── DRIVER ONBOARDING ────────────────────────────────────────────────────────
router.post('/driver/register', async (req: Request, res: Response) => {
  try {
    const authUser = await getOptionalAuthUser(req);
    if (!requireOnboardingAuth(authUser, res)) return;
    const {
      full_name, phone, national_id, license_number,
      vehicle_type, vehicle_plate, vehicle_capacity,
      operator_id, // optional — if affiliated with an agence
      selfie_base64, // for ID verification
      base_city,
      operating_zone,
      affiliation_name
    } = req.body;

    const normalizedPhone = normalizeCameroonPhone(phone);
    const resolvedName = normalizeOptionalText(full_name);
    const fallbackName = normalizedPhone ? `AFAT operator ${normalizedPhone.slice(-4)}` : null;
    const operatorName = resolvedName || fallbackName;

    if (!operatorName || !normalizedPhone) {
      return res.status(400).json({ error: 'Missing required fields: phone' });
    }

    const resolvedNationalId = normalizeOptionalText(national_id);
    const resolvedLicenseNumber = normalizeOptionalText(license_number);
    const intakeStatus =
      resolvedNationalId && resolvedLicenseNumber
        ? 'verification_ready'
        : resolvedNationalId || resolvedLicenseNumber
          ? 'partial_documents'
          : 'field_followup_required';

    const existing = await findExistingProfile({ authUserId: authUser?.id, phone: normalizedPhone });

    if (existing) {
      if (!canResumeProfile(existing, authUser)) {
        return res.status(409).json({ error: 'This operator profile already exists. Sign in to resume it.' });
      }
      const contractorCode = existing.contractor_code || `AFAT-D-${Date.now().toString(36).toUpperCase()}`;
      const applicationStatus = isOperatorApproved(existing)
        ? 'APPROVED'
        : deriveOperatorApplicationStatus(intakeStatus);
      const { data: profile, error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: operatorName,
          role: isOperatorApproved(existing) ? 'operator' : (existing.role || 'commuter'),
          national_id_number: resolvedNationalId,
          license_number: resolvedLicenseNumber,
          contractor_code: contractorCode,
          operator_application_status: applicationStatus,
          operator_application_submitted_at: existing.operator_application_submitted_at || new Date().toISOString(),
          operator_review_notes: applicationStatus === 'APPROVED'
            ? existing.operator_review_notes || 'Operator remains approved.'
            : 'Operator intake refreshed and queued for AFAT review.',
          is_active: applicationStatus === 'APPROVED',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;

      let vehicle = null;
      if (vehicle_plate && vehicle_type) {
        const { data: existingVehicle } = await supabase
          .from('vehicles')
          .select('*')
          .eq('operator_id', existing.id)
          .eq('plate_number', vehicle_plate)
          .maybeSingle();

        if (existingVehicle) {
          vehicle = existingVehicle;
        } else {
          const { data: v } = await supabase
            .from('vehicles')
            .insert({
              operator_id: existing.id,
              plate_number: vehicle_plate,
              type: vehicle_type,
              capacity: vehicle_capacity || 4,
              status: 'inactive',
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          vehicle = v;
        }
      }

      await seedComplianceRecords(
        buildOperatorComplianceRecords({
          profileId: existing.id,
          vehicleType: vehicle_type,
          baseCity: base_city,
          operatingZone: operating_zone,
          affiliationName: affiliation_name,
          verificationStatus: profile.verification_status || 'pending',
        })
      );

      return res.status(200).json({
        success: true,
        resumed: true,
        driver: {
          id: profile.id,
          full_name: profile.full_name || operatorName,
          phone: normalizedPhone,
          contractor_code: contractorCode,
          verification_status: profile.verification_status || 'pending',
          operator_application_status: profile.operator_application_status || applicationStatus,
          commission_rate: '8%',
          vehicle,
          onboarding_context: {
            vehicle_type,
            base_city: base_city || null,
            operating_zone: operating_zone || null,
            affiliation_name: affiliation_name || null,
            intake_status: intakeStatus,
            application_status: profile.operator_application_status || applicationStatus,
          }
        },
        message: applicationStatus === 'APPROVED'
          ? `${operatorName} remains AFAT-approved and can continue live operator work.`
          : intakeStatus === 'verification_ready'
            ? `${operatorName} profile updated and queued for AFAT operator verification.`
            : `${operatorName} profile updated as a partial intake. AFAT still needs document follow-up before full activation.`
      });
    }

    // AI verification of documents if selfie provided
    let verificationStatus = 'pending';
    if (selfie_base64) {
      try {
        const result = await aiRouter.route('vision', {
          image: selfie_base64,
          prompt: 'Verify this is a real person selfie for driver registration. Check for: clear face visible, no masks, good lighting. Return JSON: { verified: boolean, confidence: number, issues: [] }'
        });
        const parsed = JSON.parse(result.text);
        verificationStatus = parsed.verified ? 'verified' : 'needs_review';
      } catch {
        verificationStatus = 'pending'; // Manual review fallback
      }
    }

    // Generate contractor code
    const contractorCode = `AFAT-D-${Date.now().toString(36).toUpperCase()}`;
    const applicationStatus = deriveOperatorApplicationStatus(intakeStatus);

    // Create driver profile
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        ...(authUser?.id ? { id: authUser.id } : {}),
        full_name: operatorName,
        username: authUser?.email ? String(authUser.email).split('@')[0] : undefined,
        phone: normalizedPhone,
        role: 'commuter',
        national_id_number: resolvedNationalId,
        license_number: resolvedLicenseNumber,
        contractor_code: contractorCode,
        verification_status: verificationStatus,
        driver_dna_tier: 'Insufficient verified evidence',
        commission_rate: 0.08, // 8% default platform fee
        fatigue_hours_today: 0,
        max_daily_hours: 12,
        operator_id: operator_id || null,
        operator_application_status: applicationStatus,
        operator_application_submitted_at: new Date().toISOString(),
        operator_review_notes: applicationStatus === 'UNDER_REVIEW'
          ? 'Operator intake received and waiting for approval.'
          : 'Operator intake saved; more documents are still needed before approval.',
        is_active: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Register vehicle if provided
    let vehicle = null;
    if (vehicle_plate && vehicle_type) {
      const { data: v } = await supabase
        .from('vehicles')
        .insert({
          operator_id: profile.id,
          plate_number: vehicle_plate,
          type: vehicle_type,
          capacity: vehicle_capacity || 4,
          status: 'inactive',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      vehicle = v;
    }

    await seedComplianceRecords(
      buildOperatorComplianceRecords({
        profileId: profile.id,
        vehicleType: vehicle_type,
        baseCity: base_city,
        operatingZone: operating_zone,
        affiliationName: affiliation_name,
        verificationStatus,
      })
    );

    res.status(201).json({
      success: true,
      driver: {
        id: profile.id,
        full_name: profile.full_name || operatorName,
        phone: normalizedPhone,
        contractor_code: contractorCode,
        verification_status: verificationStatus,
        operator_application_status: applicationStatus,
        commission_rate: '8%',
        vehicle,
        onboarding_context: {
          vehicle_type,
          base_city: base_city || null,
          operating_zone: operating_zone || null,
          affiliation_name: affiliation_name || null,
          intake_status: intakeStatus,
          application_status: applicationStatus,
        }
      },
      message: intakeStatus === 'verification_ready'
        ? `Bienvenue ${operatorName}! Votre dossier operateur est en revue AFAT. Code contractant: ${contractorCode}.`
        : `Bienvenue ${operatorName}. Your AFAT intake is saved, but more identity or vehicle documents are still needed before full verification.`
    });
  } catch (error: any) {
    console.error('Driver registration error:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// ── VEHICLE REGISTRATION ─────────────────────────────────────────────────────
router.post('/vehicle/register', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['operator', 'admin', 'planner']);
    if (!access) return;
    const { driver_id, plate_number, vehicle_type, capacity, brand, model, year, color } = req.body;
    const resolvedDriverId = access.profile.role === 'operator' ? access.profile.id : driver_id;

    if (!resolvedDriverId || !plate_number || !vehicle_type) {
      return res.status(400).json({ error: 'Missing: driver_id, plate_number, vehicle_type' });
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        operator_id: resolvedDriverId,
        plate_number,
        type: vehicle_type,
        capacity: capacity || 4,
        brand: brand || null,
        model: model || null,
        year: year || null,
        color: color || null,
        status: 'inactive',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, vehicle: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Vehicle registration failed' });
  }
});

// ── PASSENGER REGISTRATION ───────────────────────────────────────────────────
router.post('/passenger/register', async (req: Request, res: Response) => {
  try {
    const authUser = await getOptionalAuthUser(req);
    if (!requireOnboardingAuth(authUser, res)) return;
    const { full_name, phone, emergency_contact, preferred_city, preferred_zone } = req.body;
    const normalizedPhone = normalizeCameroonPhone(phone);
    const resolvedName = normalizeOptionalText(full_name);
    const fallbackName = normalizedPhone ? `AFAT commuter ${normalizedPhone.slice(-4)}` : null;
    const commuterName = resolvedName || fallbackName;

    if (!commuterName || !normalizedPhone) {
      return res.status(400).json({ error: 'Missing: phone' });
    }

    const existing = await findExistingProfile({ authUserId: authUser?.id, phone: normalizedPhone });

    if (existing) {
      if (!canResumeProfile(existing, authUser)) {
        return res.status(409).json({ error: 'This commuter profile already exists. Sign in to resume it.' });
      }
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: commuterName,
          role: existing.role || 'commuter',
          emergency_contact: emergency_contact || existing.emergency_contact || null,
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({
        success: true,
        resumed: true,
        user: {
          id: data.id,
          full_name: data.full_name,
          onboarding_context: {
            preferred_city: preferred_city || null,
            preferred_zone: preferred_zone || null,
            intake_status: resolvedName ? 'named_profile' : 'phone_first_partial',
          }
        },
        message: 'Existing AFAT profile resumed.'
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        ...(authUser?.id ? { id: authUser.id } : {}),
        full_name: commuterName,
        username: authUser?.email ? String(authUser.email).split('@')[0] : undefined,
        phone: normalizedPhone,
        role: 'commuter',
        emergency_contact: emergency_contact || null,
        trust_points: 50,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      success: true,
      user: {
        id: data.id,
        full_name: commuterName,
        onboarding_context: {
          preferred_city: preferred_city || null,
          preferred_zone: preferred_zone || null,
          intake_status: resolvedName ? 'named_profile' : 'phone_first_partial',
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// ── GOVERNMENT / PUBLIC PARTNER REGISTRATION ───────────────────────────────
router.post('/public-partner/register', async (req: Request, res: Response) => {
  try {
    const authUser = await getOptionalAuthUser(req);
    if (!requireOnboardingAuth(authUser, res)) return;
    const {
      entity_name,
      partner_type,
      registration_number,
      official_domain,
      jurisdiction,
      mandate_scope,
      service_coverage,
      representative_name,
      phone,
    } = req.body;

    const normalizedPhone = normalizeCameroonPhone(phone);
    const entityName = normalizeOptionalText(entity_name);
    const representativeName = normalizeOptionalText(representative_name) || 'Public Partner Representative';
    if (!entityName || !normalizedPhone) {
      return res.status(400).json({ error: 'Entity name and contact phone are required.' });
    }

    const existing = await findExistingProfile({ authUserId: authUser?.id, phone: normalizedPhone });
    if (existing && !canResumeProfile(existing, authUser)) {
      return res.status(409).json({ error: 'This representative profile already exists. Sign in to resume it.' });
    }

    const profilePayload = existing
      ? supabase.from('profiles').update({
          full_name: representativeName,
          role: existing.role || 'commuter',
          is_active: true,
          operator_review_notes: 'Public partner intake submitted. Membership does not grant AFAT Admin or Planner authority.',
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      : supabase.from('profiles').insert({
          ...(authUser?.id ? { id: authUser.id } : {}),
          full_name: representativeName,
          username: authUser?.email ? String(authUser.email).split('@')[0] : undefined,
          phone: normalizedPhone,
          role: 'commuter',
          access_level: 'verified',
          approval_status: 'self_service',
          trust_points: 50,
          is_active: true,
          operator_review_notes: 'Public partner intake submitted. Membership does not grant AFAT Admin or Planner authority.',
          created_at: new Date().toISOString(),
        });

    const { data: profile, error: profileError } = await profilePayload.select().single();
    if (profileError) throw profileError;

    const isVerificationReady = Boolean(registration_number && jurisdiction && mandate_scope);
    const { data: existingMembership } = await supabase
      .from('public_partner_memberships')
      .select('id, partner_id')
      .eq('profile_id', profile.id)
      .maybeSingle();

    const entityDetails = {
        name: entityName,
        partner_type: normalizeOptionalText(partner_type) || 'government',
        registration_number: normalizeOptionalText(registration_number),
        official_domain: normalizeOptionalText(official_domain),
        jurisdiction: normalizeOptionalText(jurisdiction),
        mandate_scope: normalizeOptionalText(mandate_scope),
        service_coverage: normalizeOptionalText(service_coverage),
        contact_phone: normalizedPhone,
        status: isVerificationReady ? 'under_review' : 'partial_intake',
        updated_at: new Date().toISOString(),
      };
    const entityPayload = existingMembership?.partner_id
      ? supabase.from('public_partner_entities').update(entityDetails).eq('id', existingMembership.partner_id)
      : supabase.from('public_partner_entities').insert(entityDetails);
    const { data: entity, error: entityError } = await entityPayload
      .select()
      .single();
    if (entityError) throw entityError;

    const membershipPayload = existingMembership?.id
      ? supabase.from('public_partner_memberships').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', existingMembership.id)
      : supabase.from('public_partner_memberships').insert({
          partner_id: entity.id,
          profile_id: profile.id,
          role: 'representative',
          status: 'active',
        });
    const { data: membership, error: membershipError } = await membershipPayload
      .select()
      .single();
    if (membershipError) throw membershipError;

    res.status(201).json({
      success: true,
      partner: {
        ...entity,
        onboarding_context: { intake_status: entity.status },
      },
      membership,
      profile: {
        id: profile.id,
        role: profile.role || 'commuter',
        full_name: profile.full_name,
      },
      authority_boundary: {
        grants_platform_role: false,
        excluded: ['citizen_pii', 'afat_admin', 'operator_financials'],
      },
    });
  } catch (error: any) {
    console.error('Public partner registration error:', error);
    res.status(500).json({ error: error.message || 'Public partner registration failed' });
  }
});

// ── COMPANY / FLEET REGISTRATION ────────────────────────────────────────────
router.post('/company/register', async (req: Request, res: Response) => {
  try {
    const authUser = await getOptionalAuthUser(req);
    if (!requireOnboardingAuth(authUser, res)) return;
    const { company_name, phone, contact_person, fleet_size, notes, company_type, service_coverage } = req.body;
    const normalizedPhone = normalizeCameroonPhone(phone);

    const resolvedCompanyName = normalizeOptionalText(company_name);
    const resolvedContactPerson = normalizeOptionalText(contact_person);
    const companyDisplayName = resolvedCompanyName || (normalizedPhone ? `AFAT fleet intake ${normalizedPhone.slice(-4)}` : null);
    const coordinatorName = resolvedContactPerson || resolvedCompanyName || 'AFAT Fleet Coordinator';

    if (!companyDisplayName || !normalizedPhone) {
      return res.status(400).json({ error: 'Missing: phone' });
    }

    const existing = await findExistingProfile({ authUserId: authUser?.id, phone: normalizedPhone });
    if (existing && !canResumeProfile(existing, authUser)) {
      return res.status(409).json({ error: 'This fleet profile already exists. Sign in to resume it.' });
    }

    const profilePayload = existing
      ? supabase
          .from('profiles')
          .update({
            full_name: coordinatorName,
            role: existing.role || 'commuter',
            operator_review_notes: 'Fleet/company intake submitted. Planner authority requires AFAT staff approval.',
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      : supabase
          .from('profiles')
          .insert({
            ...(authUser?.id ? { id: authUser.id } : {}),
            full_name: coordinatorName,
            username: authUser?.email ? String(authUser.email).split('@')[0] : undefined,
            phone: normalizedPhone,
            role: 'commuter',
            trust_points: 50,
            operator_review_notes: 'Fleet/company intake submitted. Planner authority requires AFAT staff approval.',
            is_active: true,
            created_at: new Date().toISOString()
          });

    const { data, error } = await profilePayload.select().single();

    if (error) throw error;

    const { data: existingCompany } = await supabase
      .from('companies')
      .select('*')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    const companyPayload = existingCompany
      ? supabase
          .from('companies')
          .update({
            name: companyDisplayName,
            contact_person: coordinatorName,
            fleet_size: fleet_size || existingCompany.fleet_size || null,
            notes: notes || existingCompany.notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCompany.id)
      : supabase
          .from('companies')
          .insert({
            name: companyDisplayName,
            phone: normalizedPhone,
            contact_person: coordinatorName,
            fleet_size: fleet_size || null,
            notes: notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

    const { data: company, error: companyError } = await companyPayload.select().single();

    if (companyError) throw companyError;

    const { data: membership } = await supabase
      .from('company_memberships')
      .select('id')
      .eq('company_id', company.id)
      .eq('profile_id', data.id)
      .maybeSingle();

    const { error: membershipError } = membership
      ? { error: null }
      : await supabase.from('company_memberships').insert({
        company_id: company.id,
        profile_id: data.id,
        role: 'owner',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (membershipError) throw membershipError;

    await seedComplianceRecords(
      buildCompanyComplianceRecords({
        companyId: company.id,
        serviceCoverage: service_coverage,
        companyType: company_type,
        companyNotes: notes,
      })
    );

    res.status(201).json({
      success: true,
      company: {
        id: company.id,
        company_name: company.name,
        contact_person: coordinatorName,
        fleet_size: company.fleet_size,
        notes: company.notes,
        company_type: company_type || null,
        service_coverage: service_coverage || null,
        onboarding_context: {
          intake_status: resolvedCompanyName && resolvedContactPerson ? 'verification_ready' : 'partial_intake',
        }
      },
      profile: {
        id: data.id,
        role: data.role || 'commuter',
        full_name: coordinatorName,
        company_application_status: resolvedCompanyName && resolvedContactPerson ? 'UNDER_REVIEW' : 'PARTIAL_INTAKE',
      },
      message: resolvedCompanyName && resolvedContactPerson
        ? `${companyDisplayName} is now queued for AFAT fleet onboarding.`
        : `${companyDisplayName} intake is saved. AFAT still needs coordinator or company details before full fleet activation.`
    });
  } catch (error: any) {
    console.error('Company registration error:', error);
    res.status(500).json({ error: error.message || 'Company registration failed' });
  }
});

// ── CLIENT FARE POSTING (Passengers post their prices) ───────────────────────
router.post('/fare/post', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['commuter']);
    if (!access) return;
    const { origin, destination, proposed_price, vehicle_type, departure_time, notes } = req.body;
    const resolvedPassengerId = access.profile.id;

    if (!origin || !destination || !proposed_price) {
      return res.status(400).json({ error: 'Missing: origin, destination, proposed_price' });
    }

    // Generate a meeting code for the checkpoint
    const meetingCode = `M-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data, error } = await supabase
      .from('fare_requests')
      .insert({
        passenger_id: resolvedPassengerId,
        origin,
        destination,
        proposed_price,
        vehicle_type: vehicle_type || 'any',
        departure_time: departure_time || null,
        meeting_code: meetingCode,
        status: 'open', // open | matched | negotiating | confirmed | expired
        notes: notes || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2h expiry
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      fare_request: data,
      meeting_code: meetingCode,
      message: `Fare posted: ${origin} → ${destination} at ${proposed_price} XAF. Meeting code: ${meetingCode}. Drivers will be notified.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Fare posting failed' });
  }
});

// ── DRIVERS BROWSE OPEN FARES ────────────────────────────────────────────────
router.get('/fare/browse', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['operator', 'admin', 'planner']);
    if (!access) return;
    const { origin, destination, vehicle_type } = req.query;

    let query = supabase
      .from('fare_requests')
      .select('*, profiles:passenger_id(full_name, trust_points)')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('proposed_price', { ascending: false }) // Highest price first for drivers
      .limit(20);

    if (origin) query = query.ilike('origin', `%${origin}%`);
    if (destination) query = query.ilike('destination', `%${destination}%`);
    if (vehicle_type) query = query.eq('vehicle_type', vehicle_type);

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ fares: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to browse fares' });
  }
});

// ── DRIVER ACCEPTS / NEGOTIATES FARE ─────────────────────────────────────────
router.post('/fare/respond', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['operator']);
    if (!access) return;
    const { fare_id, action, counter_price } = req.body;
    const resolvedDriverId = access.profile.id;
    // action: 'accept' | 'counter' | 'reject'

    if (!fare_id || !action) {
      return res.status(400).json({ error: 'Missing: fare_id, action' });
    }

    if (action === 'accept') {
      // Direct accept — create booking
      const { data: fare } = await supabase
        .from('fare_requests')
        .select('*')
        .eq('id', fare_id)
        .single();

      if (!fare || fare.status !== 'open') {
        return res.status(400).json({ error: 'Fare no longer available' });
      }

      // Update fare status
      await supabase.from('fare_requests').update({ status: 'confirmed', matched_driver_id: resolvedDriverId }).eq('id', fare_id);

      res.status(200).json({
        success: true,
        status: 'confirmed',
        meeting_code: fare.meeting_code,
        message: `Confirmed! Meet passenger at checkpoint. Code: ${fare.meeting_code}`
      });

    } else if (action === 'counter') {
      // Insert negotiation entry
      await supabase.from('negotiations').insert({
        booking_id: fare_id,
        role: 'operator',
        price: counter_price,
        status: 'pending'
      });

      await supabase.from('fare_requests').update({ status: 'negotiating' }).eq('id', fare_id);

      res.status(200).json({
        success: true,
        status: 'negotiating',
        counter_price,
        message: `Counter offer of ${counter_price} XAF sent to passenger.`
      });

    } else {
      res.status(200).json({ success: true, status: 'rejected' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to respond to fare' });
  }
});

// ── DRIVER POSTS AVAILABILITY/PRICE ──────────────────────────────────────────
router.post('/fare/driver-post', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['operator']);
    if (!access) return;
    const { origin, destination, price, vehicle_type, departure_time } = req.body;
    const resolvedDriverId = access.profile.id;

    if (!origin || !destination || !price) {
      return res.status(400).json({ error: 'Missing: origin, destination, price' });
    }

    const { data, error } = await supabase
      .from('driver_offers')
      .insert({
        driver_id: resolvedDriverId,
        origin,
        destination,
        price,
        vehicle_type: vehicle_type || 'any',
        departure_time: departure_time || null,
        status: 'active',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4h expiry
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      offer: data,
      message: `Offer posted: ${origin} → ${destination} at ${price} XAF. Passengers can now book you.`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Driver offer posting failed' });
  }
});

// ── MARKET INTELLIGENCE (Get Average & Suggested Price) ──────────────────────
router.get('/fare/market-stats', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { origin, destination } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination required' });
    }

    // Fetch recent successful fares for this route
    const { data: fares } = await supabase
      .from('fare_requests')
      .select('proposed_price')
      .eq('origin', origin)
      .eq('destination', destination)
      .eq('status', 'confirmed')
      .limit(50);

    const prices = (fares || []).map(f => f.proposed_price);
    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    
    // AI Suggestion based on market pulse
    const aiSuggestion = await aiRouter.route('negotiate', {
      route: `${origin} to ${destination}`,
      distance: 10, // Mock distance
      demand: 'normal',
      offer: avgPrice || 500
    });

    const parsedAi = JSON.parse(aiSuggestion.text);

    res.status(200).json({
      route: { origin, destination },
      average_price: avgPrice,
      sample_size: prices.length,
      market_price: parsedAi.suggested_price || avgPrice || 500,
      ai_reasoning: parsedAi.reasoning || 'Based on historical corridor data.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Market stats failed' });
  }
});

// ── FATIGUE CHECK ────────────────────────────────────────────────────────────
router.get('/driver/fatigue/:driver_id', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { driver_id } = req.params;
    const isStaff = ['admin', 'planner'].includes(String(access.profile.role));
    if (!isStaff && access.profile.id !== driver_id) return res.status(403).json({ error: 'Forbidden' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('fatigue_hours_today, max_daily_hours, full_name')
      .eq('id', driver_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    const hoursWorked = profile.fatigue_hours_today || 0;
    const maxHours = profile.max_daily_hours || 12;
    const fatigueLevel = hoursWorked / maxHours;

    let status: 'green' | 'yellow' | 'red' = 'green';
    let message = 'Conducteur en forme. Bonne route!';

    if (fatigueLevel >= 0.85) {
      status = 'red';
      message = `⛔ FATIGUE CRITIQUE: ${hoursWorked}h/${maxHours}h. Arrêtez-vous immédiatement.`;
    } else if (fatigueLevel >= 0.65) {
      status = 'yellow';
      message = `⚠️ Attention fatigue: ${hoursWorked}h/${maxHours}h. Pause recommandée.`;
    }

    res.status(200).json({
      driver: profile.full_name,
      hours_worked: hoursWorked,
      max_hours: maxHours,
      fatigue_percentage: Math.round(fatigueLevel * 100),
      status,
      message,
      can_drive: fatigueLevel < 0.85
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Fatigue check failed' });
  }
});

// ── LOG DRIVE TIME ───────────────────────────────────────────────────────────
router.post('/driver/log-time', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res, ['operator', 'admin', 'planner']);
    if (!access) return;
    const { driver_id, hours } = req.body;
    const resolvedDriverId = access.profile.role === 'operator' ? access.profile.id : driver_id;
    const parsedHours = Number(hours);
    if (!resolvedDriverId || !Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      return res.status(400).json({ error: 'Valid driver_id and hours between 0 and 24 are required' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('fatigue_hours_today')
      .eq('id', resolvedDriverId)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    const newHours = Math.min(24, (profile.fatigue_hours_today || 0) + parsedHours);

    await supabase
      .from('profiles')
      .update({ fatigue_hours_today: newHours })
      .eq('id', resolvedDriverId);

    res.status(200).json({ success: true, total_hours_today: newHours });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to log time' });
  }
});

// ── CONTRACTOR AGREEMENT INFO ────────────────────────────────────────────────
router.get('/driver/contract/:driver_id', async (req: Request, res: Response) => {
  try {
    const access = await requireAuthRole(req, res);
    if (!access) return;
    const { driver_id } = req.params;
    const isStaff = ['admin', 'planner'].includes(String(access.profile.role));
    if (!isStaff && access.profile.id !== driver_id) return res.status(403).json({ error: 'Forbidden' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, contractor_code, commission_rate, trust_score, driver_dna_tier, created_at')
      .eq('id', driver_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Driver not found' });

    let effectiveRate = profile.commission_rate || 0.08;

    res.status(200).json({
      driver: profile.full_name,
      contractor_code: profile.contractor_code,
      base_commission: '8%',
      effective_commission: `${Math.round(effectiveRate * 100)}%`,
      dna_score: profile.trust_score ?? null,
      tier: profile.driver_dna_tier,
      member_since: profile.created_at,
      contract_type: 'Independent Service Provider',
      terms: 'AFAT platform usage agreement. Driver retains full independence. Driver DNA remains evidence-gated and does not automatically change commission.'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch contract' });
  }
});

export default router;
