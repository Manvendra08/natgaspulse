import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ message: 'Weather API Route' });
}
