import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'operational',
    platform: 'OSIRIS',
    version: '1.0.0',
    uptime: process.uptime ? Math.round(process.uptime()) : 0,
    timestamp: new Date().toISOString(),
    endpoints: [
      '/osiris/api/flights',
      '/osiris/api/satellites',
      '/osiris/api/earthquakes',
      '/osiris/api/news',
      '/osiris/api/gdelt',
      '/osiris/api/markets',
      '/osiris/api/frontlines',
      '/osiris/api/region-dossier',
    ],
  });
}
