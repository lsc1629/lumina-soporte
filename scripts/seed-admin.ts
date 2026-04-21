/**
 * Script para crear el usuario admin inicial en Supabase.
 * Ejecutar con: npx tsx scripts/seed-admin.ts
 */

const SUPABASE_URL = 'https://vwddlfdhuajgssjqeomm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3ZGRsZmRodWFqZ3NzanFlb21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MTE1NTMsImV4cCI6MjA4ODk4NzU1M30.t88zrGbdgwvnH97fNu2vCvy-Wb2IAL6sUWU93dzHFe8';

async function createAdmin() {
  console.log('Registrando usuario admin...');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: 'donluissalascortes@gmail.com',
      password: 'lsc16291978@0319',
      data: {
        full_name: 'Luis Salas Cortés',
        role: 'admin',
      },
    }),
  });

  const data = await res.json();

  if (res.ok) {
    console.log('Usuario creado exitosamente!');
    console.log('ID:', data.user?.id);
    console.log('Email:', data.user?.email);
    console.log('');
    console.log('IMPORTANTE: Revisa tu correo para confirmar la cuenta,');
    console.log('o desactiva "Confirm email" en Supabase > Auth > Settings.');
  } else {
    console.error('Error al crear usuario:', data);
  }
}

createAdmin();
