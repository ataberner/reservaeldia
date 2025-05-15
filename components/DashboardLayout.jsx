import { useState } from 'react';

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <button className="hamburger" onClick={toggleSidebar}>
          ☰
        </button>

        {sidebarOpen && (
          <div className="sidebar-content">
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px' }}>
              Menú
            </h2>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Inicio</a>
              <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Mis invitaciones</a>
              <a href="#" style={{ textDecoration: 'none', color: '#333' }}>Ayuda</a>
            </nav>
          </div>
        )}
      </aside>

      {/* Fondo principal color #f4f0fe */}
      <main className={`main`}>
  <div className={`main-card ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
    {children}
  </div>
</main>


    </div>
  );
}
