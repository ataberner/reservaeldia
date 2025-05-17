// src/components/DashboardLayout.jsx
import { useState } from "react";
import { FaBars } from "react-icons/fa";
import Link from "next/link";

export default function DashboardLayout({ children }) {
  const [sidebarAbierta, setSidebarAbierta] = useState(true);

  return (
    <div className="flex h-screen bg-gray-100">
      
      {/* Sidebar */}
      <aside className={`bg-purple-800 text-white transition-all duration-300 ${sidebarAbierta ? "w-64" : "w-16"} flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b border-purple-700">
          <button onClick={() => setSidebarAbierta(!sidebarAbierta)}>
            <FaBars className="text-white text-xl" />
          </button>
          {sidebarAbierta && <span className="ml-2 font-bold">Menú</span>}
        </div>
        {sidebarAbierta && (
          <nav className="p-4">
            <ul className="space-y-2">
              <li><Link href="/dashboard">Dashboard</Link></li>
              {/* Agregá más links si querés */}
            </ul>
          </nav>
        )}
      </aside>

      {/* Área principal */}
      <main className="flex-1 overflow-y-auto p-4">
        {children}
      </main>
    </div>
  );
}
