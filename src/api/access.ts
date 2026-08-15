import express, { NextFunction, Request, Response } from 'express';
import {
  AccessControlError,
  acceptStaffInvitation,
  accessSnapshot,
  bootstrapFounder,
  createStaffInvitation,
  requestContext,
  requireSupabaseIdentity,
  setFounderPass,
  verifyFounderPass,
} from '../services/AccessControlService';

const router = express.Router();

function accessRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

router.get('/access/me', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  res.status(200).json({ success: true, access: await accessSnapshot(identity) });
}));

router.post('/access/founder/bootstrap', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  const result = await bootstrapFounder(
    identity,
    String(req.body?.bootstrapCode || ''),
    requestContext(req),
  );
  res.status(201).json({
    success: true,
    assignment_id: result.assignmentId,
    next_step: 'Configure Founder Pass while the session remains at AAL2.',
  });
}));

router.put('/access/founder/pass', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await setFounderPass(identity, String(req.body?.founderPass || ''), requestContext(req));
  res.status(200).json({ success: true, message: 'Founder Pass configured.' });
}));

router.post('/access/founder/pass/verify', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await verifyFounderPass(identity, String(req.body?.founderPass || ''), requestContext(req));
  res.status(200).json({ success: true, verified: true });
}));

router.post('/access/staff/invitations', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  const invitation = await createStaffInvitation(identity, {
    email: String(req.body?.email || ''),
    roleKey: String(req.body?.roleKey || ''),
    companyId: req.body?.companyId ? String(req.body.companyId) : null,
    scopes: req.body?.scopes,
    reason: req.body?.reason ? String(req.body.reason) : undefined,
  }, requestContext(req));
  res.status(201).json({ success: true, invitation });
}));

router.post('/access/staff/invitations/accept', accessRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  const invitationId = String(req.body?.invitationId || '');
  const invitationToken = String(req.body?.invitationToken || '');
  if (!invitationId || !invitationToken) {
    throw new AccessControlError(400, 'Invitation ID and token are required.');
  }
  const result = await acceptStaffInvitation(
    identity,
    invitationId,
    invitationToken,
    requestContext(req),
  );
  res.status(200).json({
    success: true,
    assignment_id: result.assignmentId,
    message: 'AFAT staff invitation accepted.',
  });
}));

export function accessErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (error instanceof AccessControlError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof Error) {
    console.error('AFAT access foundation error:', error.message);
    return res.status(500).json({ error: 'AFAT access operation failed.' });
  }
  return next(error);
}

export default router;
