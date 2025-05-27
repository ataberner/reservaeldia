// components/Sidebar.jsx
import Link from 'next/link';

export default function Sidebar() {
  return (
    <aside
      style={{
        backgroundColor: '#773dbe', // mismo que 'bg-reserva-purple'
        width: '256px',
        minHeight: '100vh',
        padding: '24px',
        color: 'white',
        zIndex: 1,
        flexShrink: 0, // importante para layout con flex
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
        MenúUUU
      </h2>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'white' }}>
          Inicio
        </Link>
        <Link href="#" style={{ textDecoration: 'none', color: 'white' }}>
          Mis invitaciones
        </Link>
        <Link href="#" style={{ textDecoration: 'none', color: 'white' }}>
          Ayuda
        </Link>
      </nav>
    </aside>
  );
}
