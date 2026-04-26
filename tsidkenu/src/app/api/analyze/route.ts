import { NextResponse } from 'next/server';
import { TsidkenuBrain, LegalRole } from '@/lib/brain';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { context, role } = body;

    if (!context || !role) {
      return NextResponse.json({ error: "Missing context or required role" }, { status: 400 });
    }

    // Explicitly cast to our mapped legal roles
    const aiRole = role as LegalRole;
    
    // Dispatch to the TSIDKENU Model Matrix (e.g. Gemini 3.0 Flash for orchestration)
    const result = await TsidkenuBrain.dispatch(aiRole, context);

    // Depending on the role, we structure the output for the frontend
    return NextResponse.json({ 
      success: true, 
      payload: result 
    });

  } catch (error: any) {
    console.error("[API Analyze Route] Error processing request:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to synthesize legal strategy." 
    }, { status: 500 });
  }
}
