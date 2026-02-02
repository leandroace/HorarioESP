import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================================
// Las credenciales se cargan desde el archivo .env (no subir a GitHub)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validación de variables de entorno
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ ERROR: Faltan variables de entorno de Supabase');
  console.error('Crea un archivo .env basado en .env.example');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function SalonBookingApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salones, setSalones] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [currentView, setCurrentView] = useState('consulta'); // Iniciar en consulta
  const [isAdmin, setIsAdmin] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [salonesViewMode, setSalonesViewMode] = useState('cards'); // 'cards' o 'calendar'

  // Inicializar autenticación
  useEffect(() => {
    let isMounted = true;
    let loadingTimeout;

    // Timeout de seguridad AGRESIVO: 3 segundos máximo
    loadingTimeout = setTimeout(() => {
      console.warn('⏰ TIMEOUT FORZADO: Finalizando carga');
      if (isMounted) {
        setLoading(false);
      }
    }, 3000);

    // SOLO usar el listener, NO llamar checkUser manualmente
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        console.log('🔐 Auth event:', event);
        
        // Cancelar timeout si llegamos aquí
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }

        setUser(session?.user ?? null);
        
        // ⚡ CRITICAL: TERMINAR CARGA INMEDIATAMENTE
        console.log('✅✅✅ FINALIZANDO CARGA INMEDIATAMENTE');
        if (isMounted) {
          setLoading(false);
        }
        
        if (session?.user) {
          console.log('👤 Usuario detectado:', session.user.email);
          
          // Verificar admin EN SEGUNDO PLANO (sin bloquear)
          supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single()
            .then(({ data, error }) => {
              if (error) {
                console.warn('⚠️ Error verificando rol (asumiendo user):', error.message);
                if (isMounted) setIsAdmin(false);
              } else {
                console.log('✅ Rol:', data?.role);
                if (isMounted) setIsAdmin(data?.role === 'admin');
              }
            })
            .catch(err => {
              console.error('❌ Error inesperado verificando admin:', err);
              if (isMounted) setIsAdmin(false);
            });
        } else {
          console.log('👋 Sin usuario');
          setIsAdmin(false);
        }
      }
    );

    // Trigger inicial del listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      // El listener se encargará del resto
    });

    return () => {
      console.log('🧹 Cleanup: desmontando componente');
      isMounted = false;
      if (loadingTimeout) clearTimeout(loadingTimeout);
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Cargar salones y reservas
  useEffect(() => {
    let isMounted = true;
    
    loadSalones(isMounted);
    if (user) {
      loadReservas(isMounted);
    }

    return () => {
      isMounted = false;
    };
  }, [user]);

  const loadSalones = async (isMounted = true) => {
    try {
      console.log('📋 Cargando salones...');
      
      // Timeout de 5 segundos para la query
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout cargando salones')), 5000)
      );
      
      const queryPromise = supabase
        .from('salones')
        .select('*')
        .order('nombre');
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      
      if (error) {
        console.error('❌ Error cargando salones:', error);
        if (isMounted) {
          setSalones([]);
        }
        return;
      }
      
      console.log('✅ Salones cargados:', data?.length || 0);
      
      if (isMounted) {
        setSalones(data || []);
      }
    } catch (error) {
      console.error('❌ Error/Timeout cargando salones:', error.message);
      if (isMounted) {
        setSalones([]);
      }
    }
  };

  const loadReservas = async (isMounted = true) => {
    try {
      console.log('📅 Cargando reservas...');
      
      // Timeout de 5 segundos
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout cargando reservas')), 5000)
      );
      
      // Primero intentar con JOIN completo
      const queryPromise = supabase
        .from('reservas')
        .select(`
          *,
          salones (nombre),
          profiles (email)
        `)
        .order('fecha_inicio', { ascending: true });
      
      try {
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
        
        if (error) {
          console.warn('⚠️ Error con JOIN completo, intentando sin profiles:', error.message);
          
          // Fallback: cargar sin el JOIN de profiles
          const { data: dataSimple, error: errorSimple } = await supabase
            .from('reservas')
            .select(`
              *,
              salones (nombre)
            `)
            .order('fecha_inicio', { ascending: true });
          
          if (errorSimple) {
            console.error('❌ Error cargando reservas (simple):', errorSimple);
            if (isMounted) setReservas([]);
            return;
          }
          
          console.log('✅ Reservas cargadas (sin profiles):', dataSimple?.length || 0);
          if (isMounted) setReservas(dataSimple || []);
          return;
        }
        
        console.log('✅ Reservas cargadas:', data?.length || 0);
        
        if (isMounted) {
          setReservas(data || []);
        }
      } catch (timeoutError) {
        console.error('❌ Timeout cargando reservas:', timeoutError.message);
        if (isMounted) {
          setReservas([]);
        }
      }
    } catch (error) {
      console.error('❌ Error inesperado cargando reservas:', error.message);
      if (isMounted) {
        setReservas([]);
      }
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2d1b12 0%, #1a0f0a 100%)',
        padding: '2rem'
      }}>
        <div style={{
          color: '#d4a574',
          fontSize: '1.5rem',
          fontFamily: 'DM Sans, sans-serif',
          marginBottom: '1rem',
          animation: 'pulse 2s ease-in-out infinite'
        }}>
          Cargando...
        </div>
        
        {connectionError && (
          <div style={{
            maxWidth: '500px',
            padding: '1.5rem',
            background: 'rgba(196, 69, 69, 0.15)',
            border: '1px solid rgba(196, 69, 69, 0.3)',
            borderRadius: '8px',
            color: '#c44545',
            marginTop: '1rem',
            textAlign: 'center'
          }}>
            <strong>❌ Error de Conexión</strong>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {connectionError}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#c44545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        
        {(!SUPABASE_URL || !SUPABASE_ANON_KEY) && (
          <div style={{
            maxWidth: '500px',
            padding: '1.5rem',
            background: 'rgba(196, 69, 69, 0.15)',
            border: '1px solid rgba(196, 69, 69, 0.3)',
            borderRadius: '8px',
            color: '#c44545',
            marginTop: '1rem',
            textAlign: 'center'
          }}>
            <strong>⚠️ Configuración Pendiente</strong>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              Faltan las credenciales de Supabase.
              Crea un archivo .env basado en .env.example y completa tus credenciales.
            </p>
          </div>
        )}
        
        <div style={{
          marginTop: '2rem',
          fontSize: '0.9rem',
          color: '#b8a08d',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <p>💡 Revisa la consola del navegador (F12) para más detalles</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            La carga se forzará automáticamente después de 5 segundos.
          </p>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
          color: #2c2c2c;
          min-height: 100vh;
        }
        
        .app-container {
          min-height: 100vh;
          padding: 2rem;
        }
        
        .header {
          max-width: 1400px;
          margin: 0 auto 3rem;
          padding: 2rem;
          background: rgba(220, 20, 60, 0.05);
          border: 1px solid rgba(220, 20, 60, 0.15);
          border-radius: 16px;
          backdrop-filter: blur(10px);
        }
        
        .header-title {
          font-family: 'Playfair Display', serif;
          font-size: 2.5rem;
          font-weight: 700;
          color: #C41E3A;
          margin-bottom: 0.5rem;
          letter-spacing: -0.5px;
        }
        
        .header-subtitle {
          font-size: 1.1rem;
          color: #666666;
          margin-bottom: 2rem;
        }
        
        .user-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(220, 20, 60, 0.15);
          flex-wrap: wrap;
          gap: 1rem;
        }
        
        .user-email {
          color: #C41E3A;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .badge {
          background: linear-gradient(135deg, #DC143C 0%, #A01729 100%);
          color: #ffffff;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .guest-badge {
          background: rgba(204, 204, 204, 0.2);
          color: #666666;
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        
        .nav-tabs {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }
        
        .tab-button {
          background: rgba(220, 20, 60, 0.08);
          border: 1px solid rgba(220, 20, 60, 0.2);
          color: #C41E3A;
          padding: 0.8rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.3s ease;
        }
        
        .tab-button:hover {
          background: rgba(220, 20, 60, 0.15);
          border-color: rgba(220, 20, 60, 0.4);
          transform: translateY(-2px);
        }
        
        .tab-button.active {
          background: linear-gradient(135deg, #DC143C 0%, #A01729 100%);
          color: #ffffff;
          border-color: transparent;
        }
        
        .button {
          background: linear-gradient(135deg, #DC143C 0%, #A01729 100%);
          color: #ffffff;
          border: none;
          padding: 0.8rem 1.5rem;
          border-radius: 8px;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(220, 20, 60, 0.3);
        }
        
        .button-secondary {
          background: rgba(220, 20, 60, 0.1);
          border: 1px solid rgba(220, 20, 60, 0.3);
          color: #C41E3A;
        }
        
        .button-secondary:hover {
          background: rgba(220, 20, 60, 0.2);
        }
        
        .button-danger {
          background: linear-gradient(135deg, #c44545 0%, #a33838 100%);
          color: white;
        }
        
        .content {
          max-width: 1400px;
          margin: 0 auto;
        }
        
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 2rem;
          margin-top: 2rem;
        }
        
        .card {
          background: #ffffff;
          border: 1px solid rgba(220, 20, 60, 0.2);
          border-radius: 12px;
          padding: 2rem;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
        
        .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #DC143C 0%, #A01729 100%);
          transform: scaleX(0);
          transition: transform 0.3s ease;
        }
        
        .card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(220, 20, 60, 0.2);
          border-color: rgba(220, 20, 60, 0.4);
        }
        
        .card:hover::before {
          transform: scaleX(1);
        }
        
        .card-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: #C41E3A;
          margin-bottom: 1rem;
        }
        
        .card-detail {
          color: #666666;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .card-detail strong {
          color: #C41E3A;
        }
        
        .status-indicator {
          display: inline-block;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
          margin-top: 1rem;
        }
        
        .status-available {
          background: rgba(79, 172, 115, 0.15);
          color: #4fac73;
          border: 1px solid rgba(79, 172, 115, 0.3);
        }
        
        .status-occupied {
          background: rgba(196, 69, 69, 0.15);
          color: #c44545;
          border: 1px solid rgba(196, 69, 69, 0.3);
        }
        
        .form-container {
          background: #ffffff;
          border: 1px solid rgba(220, 20, 60, 0.2);
          border-radius: 12px;
          padding: 2rem;
          max-width: 600px;
          margin: 2rem auto;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
        
        .form-group {
          margin-bottom: 1.5rem;
        }
        
        .form-label {
          display: block;
          color: #C41E3A;
          font-weight: 500;
          margin-bottom: 0.5rem;
        }
        
        .form-input {
          width: 100%;
          padding: 0.8rem;
          background: rgba(220, 20, 60, 0.05);
          border: 1px solid rgba(220, 20, 60, 0.2);
          border-radius: 8px;
          color: #2c2c2c;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          transition: all 0.3s ease;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #DC143C;
          background: rgba(220, 20, 60, 0.08);
        }
        
        .form-input::placeholder {
          color: rgba(102, 102, 102, 0.5);
        }
        
        .login-container {
          max-width: 500px;
          margin: 4rem auto;
          background: #ffffff;
          border: 1px solid rgba(220, 20, 60, 0.2);
          border-radius: 12px;
          padding: 3rem;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }
        
        .login-title {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          color: #C41E3A;
          margin-bottom: 1rem;
        }
        
        .login-subtitle {
          color: #666666;
          margin-bottom: 2rem;
        }
        
        .message {
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        
        .message-success {
          background: rgba(79, 172, 115, 0.15);
          border: 1px solid rgba(79, 172, 115, 0.3);
          color: #4fac73;
        }
        
        .message-error {
          background: rgba(196, 69, 69, 0.15);
          border: 1px solid rgba(196, 69, 69, 0.3);
          color: #c44545;
        }

        .message-info {
          background: rgba(79, 172, 115, 0.15);
          border: 1px solid rgba(79, 172, 115, 0.3);
          color: #4fac73;
        }
        
        .empty-state {
          text-align: center;
          padding: 4rem 2rem;
          color: #666666;
        }
        
        .empty-state-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          opacity: 0.3;
        }

        .view-toggle {
          display: flex;
          gap: 0.5rem;
          background: rgba(220, 20, 60, 0.08);
          padding: 0.5rem;
          border-radius: 8px;
          margin-bottom: 2rem;
        }

        .view-toggle-button {
          flex: 1;
          padding: 0.8rem 1.5rem;
          background: transparent;
          border: none;
          color: #666666;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .view-toggle-button:hover {
          background: rgba(220, 20, 60, 0.1);
          color: #C41E3A;
        }

        .view-toggle-button.active {
          background: linear-gradient(135deg, #DC143C 0%, #A01729 100%);
          color: #ffffff;
        }

        .calendar-container {
          background: #ffffff;
          border: 1px solid rgba(220, 20, 60, 0.2);
          border-radius: 12px;
          padding: 2rem;
          overflow-x: auto;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .calendar-title {
          font-family: 'Playfair Display', serif;
          font-size: 1.8rem;
          color: #C41E3A;
        }

        .calendar-controls {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .calendar-nav-button {
          padding: 0.5rem 1rem;
          background: rgba(220, 20, 60, 0.1);
          border: 1px solid rgba(220, 20, 60, 0.3);
          color: #C41E3A;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }

        .calendar-nav-button:hover {
          background: rgba(220, 20, 60, 0.2);
        }

        .calendar-date-display {
          color: #C41E3A;
          font-weight: 600;
          padding: 0 1rem;
        }

        .salon-selector {
          padding: 0.8rem 1.2rem;
          background: rgba(220, 20, 60, 0.1);
          border: 1px solid rgba(220, 20, 60, 0.3);
          color: #C41E3A;
          border-radius: 8px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          cursor: pointer;
          min-width: 250px;
          transition: all 0.3s ease;
        }

        .salon-selector:hover {
          background: rgba(220, 20, 60, 0.2);
          border-color: rgba(220, 20, 60, 0.5);
        }

        .salon-selector:focus {
          outline: none;
          border-color: #DC143C;
          background: rgba(220, 20, 60, 0.15);
        }

        .salon-selector option {
          background: #ffffff;
          color: #2c2c2c;
          padding: 0.5rem;
        }

        .salon-selector optgroup {
          background: #f5f5f5;
          color: #C41E3A;
          font-weight: 600;
        }

        .calendar-grid {
          display: grid;
          gap: 1.5rem;
        }

        .salon-row {
          background: rgba(245, 245, 245, 0.4);
          border: 1px solid rgba(220, 20, 60, 0.15);
          border-radius: 8px;
          padding: 1.5rem;
        }

        .salon-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(220, 20, 60, 0.15);
        }

        .salon-name {
          font-family: 'Playfair Display', serif;
          font-size: 1.3rem;
          color: #C41E3A;
          font-weight: 600;
        }

        .salon-info {
          color: #666666;
          font-size: 0.9rem;
        }

        .timeline {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 1rem;
        }

        .time-labels {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .time-label {
          height: 60px;
          display: flex;
          align-items: center;
          color: #666666;
          font-size: 0.85rem;
          padding-right: 0.5rem;
          border-top: 1px solid rgba(220, 20, 60, 0.1);
        }

        .time-label:first-child {
          border-top: none;
        }

        .timeline-slots {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .time-slot {
          height: 60px;
          border-top: 1px solid rgba(220, 20, 60, 0.1);
          position: relative;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .time-slot:first-child {
          border-top: none;
        }

        .time-slot:hover:not(.occupied) {
          background: rgba(220, 20, 60, 0.05);
        }

        .reservation-block {
          position: absolute;
          left: 0;
          right: 0;
          background: linear-gradient(135deg, rgba(196, 69, 69, 0.3) 0%, rgba(163, 56, 56, 0.3) 100%);
          border: 2px solid rgba(196, 69, 69, 0.6);
          border-radius: 6px;
          padding: 0.5rem;
          z-index: 10;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .reservation-block:hover {
          background: linear-gradient(135deg, rgba(196, 69, 69, 0.5) 0%, rgba(163, 56, 56, 0.5) 100%);
          border-color: rgba(196, 69, 69, 0.8);
          transform: scale(1.02);
        }

        .reservation-block-content {
          color: #2c2c2c;
          font-size: 0.85rem;
        }

        .reservation-time {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .reservation-purpose {
          opacity: 0.9;
          font-size: 0.8rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .reservation-user {
          opacity: 0.7;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .calendar-legend {
          display: flex;
          gap: 2rem;
          margin-top: 2rem;
          padding: 1rem;
          background: rgba(220, 20, 60, 0.05);
          border-radius: 8px;
          flex-wrap: wrap;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #666666;
          font-size: 0.9rem;
        }

        .legend-color {
          width: 30px;
          height: 20px;
          border-radius: 4px;
          border: 2px solid;
        }

        .legend-available {
          background: transparent;
          border-color: rgba(220, 20, 60, 0.3);
        }

        .legend-occupied {
          background: linear-gradient(135deg, rgba(196, 69, 69, 0.3) 0%, rgba(163, 56, 56, 0.3) 100%);
          border-color: rgba(196, 69, 69, 0.6);
        }
        
        @media (max-width: 768px) {
          .header-title {
            font-size: 2rem;
          }
          
          .grid {
            grid-template-columns: 1fr;
          }
          
          .app-container {
            padding: 1rem;
          }

          .timeline {
            grid-template-columns: 60px 1fr;
          }

          .time-label {
            font-size: 0.75rem;
          }

          .salon-name {
            font-size: 1.1rem;
          }

          .calendar-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <div className="app-container">
        {showLoginModal ? (
          <LoginModal onClose={() => setShowLoginModal(false)} />
        ) : (
          <>
            <Header 
              user={user} 
              isAdmin={isAdmin}
              currentView={currentView}
              setCurrentView={setCurrentView}
              onLoginClick={() => setShowLoginModal(true)}
            />
            <div className="content">
              {currentView === 'consulta' && (
                <ConsultaDisponibilidadView 
                  salones={salones} 
                  reservas={reservas}
                  user={user}
                  onLoginRequired={() => setShowLoginModal(true)}
                />
              )}
              {currentView === 'salones' && (
                <SalonesView 
                  salones={salones} 
                  reservas={reservas}
                  user={user}
                  isAdmin={isAdmin}
                  onUpdate={loadSalones}
                  onReservaUpdate={loadReservas}
                  onLoginRequired={() => setShowLoginModal(true)}
                  viewMode={salonesViewMode}
                  setViewMode={setSalonesViewMode}
                />
              )}
              {currentView === 'mis-reservas' && user && (
                <MisReservasView 
                  reservas={reservas.filter(r => r.user_id === user.id)}
                  onUpdate={loadReservas}
                />
              )}
              {currentView === 'admin' && isAdmin && (
                <AdminView 
                  salones={salones}
                  onUpdate={loadSalones}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// COMPONENTE DE LOGIN MODAL
// ============================================================================
function LoginModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const emailLower = email.toLowerCase().trim();
      
      // Paso 1: Verificar si el email está en profiles (whitelist)
      console.log('🔍 Verificando whitelist para:', emailLower);
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', emailLower)
        .maybeSingle();

      // Paso 2: Si está en whitelist → Auto-login
      if (profile) {
        console.log('✅ Usuario en whitelist detectado, intentando auto-login');
        
        // Contraseña compartida para todos los usuarios de whitelist
        const SHARED_PASSWORD = 'AutoPass_Univalle2026';
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: emailLower,
          password: SHARED_PASSWORD
        });

        if (authError) {
          // Si falla el auto-login, usar magic link como fallback
          console.warn('⚠️ Auto-login no disponible, usando magic link');
          await enviarMagicLink(emailLower, true);
        } else {
          // Auto-login exitoso
          console.log('✅ Auto-login exitoso');
          setMessage({
            type: 'success',
            text: '✅ ¡Bienvenido! Acceso concedido automáticamente.'
          });
          
          setTimeout(() => {
            onClose();
          }, 1000);
        }
      } else {
        // Paso 3: No está en whitelist → Magic Link normal
        console.log('📧 Usuario no en whitelist, enviando magic link');
        await enviarMagicLink(emailLower, false);
      }
    } catch (error) {
      console.error('❌ Error en login:', error);
      
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        setMessage({
          type: 'error',
          text: '⏰ Demasiados intentos. Espera 1 hora o usa otro email.'
        });
      } else {
        setMessage({
          type: 'error',
          text: error.message
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const enviarMagicLink = async (email, esWhitelisted) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) throw error;

    setMessage({
      type: 'success',
      text: esWhitelisted 
        ? '📧 Usuario pre-aprobado. Revisa tu correo para el enlace de acceso.' 
        : '📧 Revisa tu correo. Te hemos enviado un enlace mágico para iniciar sesión.'
    });
    setEmail('');
  };

  return (
    <>
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.3s ease;
        }
        
        .modal-content {
          background: #ffffff;
          border: 1px solid rgba(220, 20, 60, 0.3);
          border-radius: 16px;
          padding: 3rem;
          max-width: 500px;
          width: 90%;
          position: relative;
          animation: slideUp 0.3s ease;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }
        
        .modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: #666666;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.5rem;
          line-height: 1;
          transition: color 0.3s ease;
        }
        
        .modal-close:hover {
          color: #C41E3A;
        }

        .whitelist-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: rgba(79, 172, 115, 0.15);
          border: 1px solid rgba(79, 172, 115, 0.3);
          border-radius: 20px;
          color: #4fac73;
          font-size: 0.85rem;
          font-weight: 600;
          margin-top: 0.5rem;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          
          <h1 className="login-title">Iniciar Sesión</h1>
          <p className="login-subtitle">
            Ingresa tu correo electrónico
          </p>

          {message && (
            <div className={`message message-${message.type}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <input
                type="email"
                className="form-input"
                placeholder="tu-email@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <button 
              type="submit" 
              className="button" 
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>

          <p style={{ marginTop: '2rem', color: '#666666', fontSize: '0.9rem', textAlign: 'center' }}>
            Si estás pre-aprobado, entrarás automáticamente. Si no, recibirás un enlace por correo.
          </p>


          <button 
            onClick={onClose}
            className="button button-secondary"
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Continuar como visitante
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// COMPONENTE DE HEADER
// ============================================================================
function Header({ user, isAdmin, currentView, setCurrentView, onLoginClick }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="header">
      <h1 className="header-title">Gestión de Salones</h1>
      <p className="header-subtitle">
        Sistema de reservas y administración de espacios
      </p>

      {/* Pestañas - Consulta visible para TODOS */}
      <div className="nav-tabs">
        <button
          className={`tab-button ${currentView === 'consulta' ? 'active' : ''}`}
          onClick={() => setCurrentView('consulta')}
        >
          🔍 Consultar Disponibilidad
        </button>
        <button
          className={`tab-button ${currentView === 'salones' ? 'active' : ''}`}
          onClick={() => setCurrentView('salones')}
        >
          🏢 Ver Salones
        </button>
        {user && (
          <>
            <button
              className={`tab-button ${currentView === 'mis-reservas' ? 'active' : ''}`}
              onClick={() => setCurrentView('mis-reservas')}
            >
              📋 Mis Reservas
            </button>
            {isAdmin && (
              <button
                className={`tab-button ${currentView === 'admin' ? 'active' : ''}`}
                onClick={() => setCurrentView('admin')}
              >
                ⚙️ Administración
              </button>
            )}
          </>
        )}
      </div>

      {user ? (
        <div className="user-info">
          <div className="user-email">
            <span>{user.email}</span>
            {isAdmin && <span className="badge">Admin</span>}
          </div>
          <button className="button button-secondary" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      ) : (
        <div className="user-info">
          <div className="user-email">
            <span className="guest-badge">Modo Visitante</span>
            <span style={{ fontSize: '0.9rem', color: '#666666' }}>
              Consulta disponibilidad y explora salones sin iniciar sesión
            </span>
          </div>
          <button className="button" onClick={onLoginClick}>
            Iniciar Sesión
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VISTA DE CONSULTA DE DISPONIBILIDAD
// ============================================================================
function ConsultaDisponibilidadView({ salones, reservas, user, onLoginRequired }) {
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [capacidadMinima, setCapacidadMinima] = useState('');
  const [resultados, setResultados] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleBuscar = () => {
    if (!fecha || !horaInicio || !horaFin) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    if (horaFin <= horaInicio) {
      alert('La hora de fin debe ser posterior a la hora de inicio');
      return;
    }

    setSearching(true);

    const inicio = new Date(`${fecha}T${horaInicio}`);
    const fin = new Date(`${fecha}T${horaFin}`);

    // Filtrar salones por capacidad si se especificó
    let salonesDisponibles = salones;
    if (capacidadMinima) {
      salonesDisponibles = salones.filter(s => s.capacidad >= parseInt(capacidadMinima));
    }

    // Verificar disponibilidad para cada salón
    const resultado = salonesDisponibles.map(salon => {
      // Buscar reservas que se solapen con el horario solicitado
      const conflicto = reservas.find(r => {
        if (r.salon_id !== salon.id) return false;
        
        const reservaInicio = new Date(r.fecha_inicio);
        const reservaFin = new Date(r.fecha_fin);
        
        // Hay conflicto si se solapan
        return (inicio < reservaFin && fin > reservaInicio);
      });

      return {
        salon,
        disponible: !conflicto,
        conflicto: conflicto || null
      };
    });

    setResultados(resultado);
    setSearching(false);
  };

  const handleLimpiar = () => {
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setCapacidadMinima('');
    setResultados(null);
  };

  const handleReservar = (salon) => {
    if (!user) {
      onLoginRequired();
    } else {
      // Aquí podrías abrir el formulario de reserva pre-llenado
      alert(`Para reservar "${salon.nombre}", usa la pestaña "Ver Salones" o "Mis Reservas"`);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="form-container" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
        <h2 className="card-title">🔍 Consultar Disponibilidad de Salones</h2>
        <p style={{ color: '#666666', marginBottom: '2rem' }}>
          Encuentra el salón perfecto para tu evento especificando fecha, hora y capacidad necesaria.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">📅 Fecha *</label>
            <input
              type="date"
              className="form-input"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">🕐 Hora inicio *</label>
            <input
              type="time"
              className="form-input"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">🕓 Hora fin *</label>
            <input
              type="time"
              className="form-input"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">👥 Capacidad mínima (opcional)</label>
            <input
              type="number"
              className="form-input"
              value={capacidadMinima}
              onChange={(e) => setCapacidadMinima(e.target.value)}
              placeholder="Ej: 20"
              min="1"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleLimpiar}
          >
            🔄 Limpiar
          </button>
          <button
            type="button"
            className="button"
            onClick={handleBuscar}
            disabled={searching}
          >
            {searching ? 'Buscando...' : '🔍 Buscar Disponibilidad'}
          </button>
        </div>
      </div>

      {resultados && (
        <div>
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(220, 20, 60, 0.05)', borderRadius: '8px' }}>
            <h3 style={{ color: '#C41E3A', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
              📊 Resultados de búsqueda
            </h3>
            <p style={{ color: '#666666', fontSize: '0.95rem' }}>
              {fecha && new Date(fecha).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' de '}
              {horaInicio} a {horaFin}
              {capacidadMinima && ` • Capacidad mínima: ${capacidadMinima} personas`}
            </p>
            <p style={{ color: '#4fac73', marginTop: '0.5rem', fontWeight: 'bold' }}>
              ✅ {resultados.filter(r => r.disponible).length} de {resultados.length} salones disponibles
            </p>
          </div>

          <div className="grid">
            {resultados.map(({ salon, disponible, conflicto }) => (
              <div key={salon.id} className="card" style={{
                borderColor: disponible ? 'rgba(79, 172, 115, 0.3)' : 'rgba(196, 69, 69, 0.3)',
                background: disponible ? 'rgba(79, 172, 115, 0.02)' : 'rgba(196, 69, 69, 0.02)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 className="card-title">{salon.nombre}</h3>
                  <span className={`status-indicator ${disponible ? 'status-available' : 'status-occupied'}`}>
                    {disponible ? '✓ Disponible' : '✗ Ocupado'}
                  </span>
                </div>

                {salon.descripcion && (
                  <p className="card-detail" style={{ marginTop: '0.5rem' }}>{salon.descripcion}</p>
                )}

                <p className="card-detail">
                  <strong>Capacidad:</strong> {salon.capacidad} personas
                  {capacidadMinima && salon.capacidad >= parseInt(capacidadMinima) && (
                    <span style={{ color: '#4fac73', marginLeft: '0.5rem' }}>✓ Cumple requisito</span>
                  )}
                </p>

                {salon.ubicacion && (
                  <p className="card-detail">
                    <strong>Ubicación:</strong> {salon.ubicacion}
                  </p>
                )}

                {!disponible && conflicto && (
                  <div style={{ 
                    marginTop: '1rem', 
                    padding: '0.75rem', 
                    background: 'rgba(196, 69, 69, 0.1)', 
                    borderRadius: '6px',
                    fontSize: '0.85rem'
                  }}>
                    <strong style={{ color: '#c44545' }}>Reservado:</strong>
                    <p style={{ color: '#666666', marginTop: '0.25rem' }}>
                      {new Date(conflicto.fecha_inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {new Date(conflicto.fecha_fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p style={{ color: '#666666', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      {conflicto.proposito}
                    </p>
                  </div>
                )}

                {disponible && (
                  <button
                    className="button"
                    style={{ width: '100%', marginTop: '1rem' }}
                    onClick={() => handleReservar(salon)}
                  >
                    {user ? '📋 Hacer Reserva' : '🔐 Iniciar Sesión para Reservar'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {resultados.filter(r => r.disponible).length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">😔</div>
              <h2>No hay salones disponibles</h2>
              <p>No se encontraron salones disponibles para el horario y criterios especificados.</p>
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#C41E3A' }}>
                💡 Intenta con otro horario o sin especificar capacidad mínima
              </p>
            </div>
          )}
        </div>
      )}

      {!resultados && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h2>Encuentra el salón perfecto</h2>
          <p>Especifica la fecha, hora y capacidad que necesitas, y te mostraremos qué salones están disponibles.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VISTA DE SALONES
// ============================================================================
function SalonesView({ salones, reservas, user, isAdmin, onUpdate, onReservaUpdate, onLoginRequired, viewMode, setViewMode }) {
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [showReservaForm, setShowReservaForm] = useState(false);

  const getSalonStatus = (salonId) => {
    const now = new Date();
    const reservasActivas = reservas.filter(r => 
      r.salon_id === salonId &&
      new Date(r.fecha_inicio) <= now &&
      new Date(r.fecha_fin) >= now
    );
    return reservasActivas.length > 0 ? 'ocupado' : 'disponible';
  };

  const handleReservar = (salon) => {
    if (!user) {
      onLoginRequired();
      return;
    }
    setSelectedSalon(salon);
    setShowReservaForm(true);
  };

  if (salones.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏢</div>
        <h2>No hay salones disponibles</h2>
        <p>Los salones aparecerán aquí una vez que el administrador los cree</p>
        {!user && (
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#d4a574' }}>
            Estás viendo en modo visitante. Inicia sesión para hacer reservas.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {!user && (
        <div className="message message-info" style={{ marginBottom: '2rem' }}>
          <strong>👁️ Modo Visitante</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Puedes ver la disponibilidad de todos los salones. Para hacer una reserva, necesitas iniciar sesión.
          </p>
        </div>
      )}

      <div className="view-toggle">
        <button
          className={`view-toggle-button ${viewMode === 'cards' ? 'active' : ''}`}
          onClick={() => setViewMode('cards')}
        >
          <span>🏢</span>
          <span>Vista de Tarjetas</span>
        </button>
        <button
          className={`view-toggle-button ${viewMode === 'calendar' ? 'active' : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          <span>📅</span>
          <span>Vista de Cronograma</span>
        </button>
      </div>

      {showReservaForm && selectedSalon ? (
        <ReservaForm
          salon={selectedSalon}
          user={user}
          onClose={() => {
            setShowReservaForm(false);
            setSelectedSalon(null);
          }}
          onSuccess={() => {
            setShowReservaForm(false);
            setSelectedSalon(null);
            onReservaUpdate();
          }}
        />
      ) : viewMode === 'calendar' ? (
        <CalendarioView
          salones={salones}
          reservas={reservas}
          user={user}
          onReservar={handleReservar}
        />
      ) : (
        <div className="grid">
          {salones.map(salon => {
            const status = getSalonStatus(salon.id);
            return (
              <div key={salon.id} className="card">
                <h3 className="card-title">{salon.nombre}</h3>
                {salon.descripcion && (
                  <p className="card-detail">{salon.descripcion}</p>
                )}
                <p className="card-detail">
                  <strong>Capacidad:</strong> {salon.capacidad} personas
                </p>
                {salon.ubicacion && (
                  <p className="card-detail">
                    <strong>Ubicación:</strong> {salon.ubicacion}
                  </p>
                )}
                
                <div className={`status-indicator status-${status === 'disponible' ? 'available' : 'occupied'}`}>
                  {status === 'disponible' ? '✓ Disponible' : '⊗ Ocupado'}
                </div>

                {status === 'disponible' && (
                  <button
                    className="button"
                    style={{ width: '100%', marginTop: '1rem' }}
                    onClick={() => handleReservar(salon)}
                  >
                    {user ? 'Reservar' : 'Iniciar Sesión para Reservar'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ============================================================================
// VISTA DE CALENDARIO/CRONOGRAMA
// ============================================================================
function CalendarioView({ salones, reservas, user, onReservar }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSalonId, setSelectedSalonId] = useState('all'); // 'all' o ID específico
  const [collapsedSalones, setCollapsedSalones] = useState(new Set());

  // Generar horas del día (de 6am a 10pm)
  const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6 to 22

  const formatHour = (hour) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  const getReservasForSalonOnDate = (salonId, date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return reservas.filter(r => {
      if (r.salon_id !== salonId) return false;
      
      const reservaStart = new Date(r.fecha_inicio);
      const reservaEnd = new Date(r.fecha_fin);
      
      // Reserva que intersecta con este día
      return reservaStart <= endOfDay && reservaEnd >= startOfDay;
    });
  };

  const calculateReservaPosition = (reserva) => {
    const start = new Date(reserva.fecha_inicio);
    const end = new Date(reserva.fecha_fin);
    
    // Calcular hora decimal (ej: 14:30 = 14.5)
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    
    // Si la reserva empieza antes de las 6am, ajustar
    const displayStartHour = Math.max(startHour, 6);
    const displayEndHour = Math.min(endHour, 22);
    
    // Calcular posición en píxeles (60px por hora)
    const top = (displayStartHour - 6) * 60;
    const height = (displayEndHour - displayStartHour) * 60;
    
    return { top, height };
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const changeDate = (days) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const formatDateDisplay = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    
    if (compareDate.getTime() === today.getTime()) {
      return 'Hoy, ' + date.toLocaleDateString('es-ES', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
    
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const toggleCollapse = (salonId) => {
    const newCollapsed = new Set(collapsedSalones);
    if (newCollapsed.has(salonId)) {
      newCollapsed.delete(salonId);
    } else {
      newCollapsed.add(salonId);
    }
    setCollapsedSalones(newCollapsed);
  };

  // Filtrar salones según selección
  const displayedSalones = selectedSalonId === 'all' 
    ? salones 
    : salones.filter(s => s.id === selectedSalonId);

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div>
          <h2 className="calendar-title">Cronograma de Reservas</h2>
          <p style={{ color: '#b8a08d', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {selectedSalonId === 'all' 
              ? `Mostrando ${displayedSalones.length} salones` 
              : 'Vista individual'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="calendar-controls">
            <button className="calendar-nav-button" onClick={() => changeDate(-1)}>
              ← Anterior
            </button>
            <button className="calendar-nav-button" onClick={goToToday}>
              Hoy
            </button>
            <button className="calendar-nav-button" onClick={() => changeDate(1)}>
              Siguiente →
            </button>
          </div>
          <select 
            className="salon-selector"
            value={selectedSalonId}
            onChange={(e) => setSelectedSalonId(e.target.value)}
          >
            <option value="all">📋 Ver Todos los Salones</option>
            <optgroup label="Salones Individuales">
              {salones.map(salon => (
                <option key={salon.id} value={salon.id}>
                  {salon.nombre}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      <div className="calendar-date-display">
        {formatDateDisplay(selectedDate)}
      </div>

      {selectedSalonId === 'all' && salones.length > 3 && (
        <div className="message message-info" style={{ marginBottom: '1rem' }}>
          💡 <strong>Tip:</strong> Usa el selector arriba para ver un salón específico y evitar hacer scroll. 
          También puedes hacer clic en los nombres para colapsar/expandir.
        </div>
      )}

      <div className="calendar-grid">
        {displayedSalones.map(salon => {
          const salonReservas = getReservasForSalonOnDate(salon.id, selectedDate);
          const isCollapsed = collapsedSalones.has(salon.id);
          
          return (
            <div key={salon.id} className="salon-row">
              <div 
                className="salon-row-header"
                onClick={() => selectedSalonId === 'all' && toggleCollapse(salon.id)}
                style={{ cursor: selectedSalonId === 'all' ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedSalonId === 'all' && (
                    <span style={{ fontSize: '1.2rem', transition: 'transform 0.3s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                      ▼
                    </span>
                  )}
                  <div>
                    <div className="salon-name">{salon.nombre}</div>
                    <div className="salon-info">
                      Capacidad: {salon.capacidad} personas
                      {salon.ubicacion && ` • ${salon.ubicacion}`}
                    </div>
                  </div>
                </div>
                <div className="salon-info">
                  {salonReservas.length} reserva{salonReservas.length !== 1 ? 's' : ''} hoy
                </div>
              </div>

              {!isCollapsed && (
                <div className="timeline">
                  <div className="time-labels">
                    {hours.map(hour => (
                      <div key={hour} className="time-label">
                        {formatHour(hour)}
                      </div>
                    ))}
                  </div>

                  <div className="timeline-slots">
                    {hours.map(hour => (
                      <div
                        key={hour}
                        className="time-slot"
                        onClick={() => {
                          if (user) {
                            onReservar(salon);
                          }
                        }}
                      />
                    ))}

                    {salonReservas.map(reserva => {
                      const { top, height } = calculateReservaPosition(reserva);
                      
                      return (
                        <div
                          key={reserva.id}
                          className="reservation-block"
                          style={{ top: `${top}px`, height: `${height}px` }}
                          title={`${reserva.proposito} - ${reserva.profiles?.email || 'Usuario'}`}
                        >
                          <div className="reservation-block-content">
                            <div className="reservation-time">
                              {formatTime(reserva.fecha_inicio)} - {formatTime(reserva.fecha_fin)}
                            </div>
                            <div className="reservation-purpose">
                              {reserva.proposito}
                            </div>
                            {reserva.profiles?.email && (
                              <div className="reservation-user">
                                👤 {reserva.profiles.email}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCollapsed && (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: '#b8a08d',
                  fontStyle: 'italic'
                }}>
                  Haz clic en el nombre para expandir
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-color legend-available"></div>
          <span>Disponible {user ? '(haz clic para reservar)' : '(inicia sesión para reservar)'}</span>
        </div>
        <div className="legend-item">
          <div className="legend-color legend-occupied"></div>
          <span>Reservado (hover para ver detalles)</span>
        </div>
        {selectedSalonId === 'all' && salones.length > 1 && (
          <div className="legend-item">
            <span style={{ color: '#d4a574' }}>💡 Haz clic en los nombres para colapsar/expandir</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FORMULARIO DE RESERVA
// ============================================================================
function ReservaForm({ salon, user, onClose, onSuccess }) {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [proposito, setProposito] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Estados para recurrencia
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [tipoRecurrencia, setTipoRecurrencia] = useState('weeks'); // 'weeks' o 'date'
  const [numSemanas, setNumSemanas] = useState(16); // Default: semestre
  const [fechaFinRecurrencia, setFechaFinRecurrencia] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);

      if (fin <= inicio) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }

      if (esRecurrente) {
        // Crear múltiples reservas
        await crearReservasRecurrentes(inicio, fin);
      } else {
        // Crear una sola reserva
        await crearReservaSimple(inicio, fin);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const crearReservaSimple = async (inicio, fin) => {
    const { error: insertError } = await supabase
      .from('reservas')
      .insert([{
        salon_id: salon.id,
        user_id: user.id,
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
        proposito: proposito
      }]);

    if (insertError) throw insertError;
    
    setLoading(false);
    onSuccess();
  };

  const crearReservasRecurrentes = async (inicioBase, finBase) => {
    // Calcular cuántas semanas crear
    let numReservas;
    let fechaLimite;

    if (tipoRecurrencia === 'weeks') {
      numReservas = parseInt(numSemanas);
    } else {
      // Calcular basado en fecha fin
      const limiteDate = new Date(fechaFinRecurrencia);
      const diffTime = Math.abs(limiteDate - inicioBase);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      numReservas = Math.floor(diffDays / 7) + 1;
      fechaLimite = limiteDate;
    }

    // Generar array de reservas
    const reservas = [];
    const conflictos = [];

    for (let i = 0; i < numReservas; i++) {
      const inicio = new Date(inicioBase);
      inicio.setDate(inicio.getDate() + (i * 7));
      
      const fin = new Date(finBase);
      fin.setDate(fin.getDate() + (i * 7));

      // Si hay fecha límite y la pasamos, parar
      if (fechaLimite && inicio > fechaLimite) {
        break;
      }

      // Verificar conflicto para esta fecha
      const { data: existentes } = await supabase
        .from('reservas')
        .select('*')
        .eq('salon_id', salon.id)
        .or(`and(fecha_inicio.lte.${fin.toISOString()},fecha_fin.gte.${inicio.toISOString()})`);

      if (existentes && existentes.length > 0) {
        conflictos.push({
          semana: i + 1,
          fecha: inicio.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
        });
      } else {
        reservas.push({
          salon_id: salon.id,
          user_id: user.id,
          fecha_inicio: inicio.toISOString(),
          fecha_fin: fin.toISOString(),
          proposito: `${proposito} (Semana ${i + 1})`
        });
      }
    }

    // Mostrar conflictos si los hay
    if (conflictos.length > 0) {
      const listaConflictos = conflictos.map(c => `Semana ${c.semana} (${c.fecha})`).join(', ');
      throw new Error(`⚠️ Conflictos detectados en: ${listaConflictos}. No se creará ninguna reserva.`);
    }

    // Si no hay conflictos, crear todas las reservas
    const { error: insertError } = await supabase
      .from('reservas')
      .insert(reservas);

    if (insertError) throw insertError;

    setError(null);
    alert(`✅ ¡${reservas.length} reservas creadas exitosamente!`);
    setLoading(false);
    onSuccess();
  };

  const presets = [
    { label: 'Semestre completo (16 semanas)', value: 16 },
    { label: 'Medio semestre (8 semanas)', value: 8 },
    { label: 'Bimestre (8 semanas)', value: 8 },
    { label: 'Mes (4 semanas)', value: 4 },
  ];

  return (
    <div className="form-container">
      <h2 className="card-title">Reservar: {salon.nombre}</h2>
      
      {error && (
        <div className="message message-error">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Fecha y hora de inicio</label>
          <input
            type="datetime-local"
            className="form-input"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
            min={new Date().toISOString().slice(0, 16)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Fecha y hora de fin</label>
          <input
            type="datetime-local"
            className="form-input"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            required
            min={fechaInicio}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Propósito de la reserva</label>
          <textarea
            className="form-input"
            rows="3"
            value={proposito}
            onChange={(e) => setProposito(e.target.value)}
            placeholder="Ej: Clase de Programación, Reunión de proyecto, etc."
            required
          />
        </div>

        {/* Sección de Recurrencia */}
        <div className="form-group" style={{ 
          marginTop: '1.5rem', 
          padding: '1.5rem', 
          background: 'rgba(220, 20, 60, 0.05)', 
          borderRadius: '8px',
          border: '1px solid rgba(220, 20, 60, 0.15)'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={esRecurrente}
              onChange={(e) => setEsRecurrente(e.target.checked)}
              style={{ width: 'auto', cursor: 'pointer', accentColor: '#C41E3A' }}
            />
            <span className="form-label" style={{ marginBottom: 0, fontSize: '1.05rem' }}>
              🔁 Repetir semanalmente
            </span>
          </label>

          {esRecurrente && (
            <div style={{ paddingLeft: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Tipo de duración</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`tab-button ${tipoRecurrencia === 'weeks' ? 'active' : ''}`}
                    onClick={() => setTipoRecurrencia('weeks')}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    📅 Por semanas
                  </button>
                  <button
                    type="button"
                    className={`tab-button ${tipoRecurrencia === 'date' ? 'active' : ''}`}
                    onClick={() => setTipoRecurrencia('date')}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    📆 Hasta fecha
                  </button>
                </div>

                {tipoRecurrencia === 'weeks' ? (
                  <>
                    <select
                      className="form-input"
                      value={numSemanas}
                      onChange={(e) => setNumSemanas(e.target.value)}
                      style={{ marginBottom: '0.5rem' }}
                    >
                      {presets.map(preset => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>

                    <p style={{ fontSize: '0.85rem', color: '#666666', marginTop: '0.5rem' }}>
                      ✅ Se crearán <strong>{numSemanas} reservas</strong> (una cada semana, mismo día y hora)
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      type="date"
                      className="form-input"
                      value={fechaFinRecurrencia}
                      onChange={(e) => setFechaFinRecurrencia(e.target.value)}
                      min={fechaInicio ? fechaInicio.split('T')[0] : ''}
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <p style={{ fontSize: '0.85rem', color: '#666666', marginTop: '0.5rem' }}>
                      Se repetirá cada semana hasta la fecha seleccionada
                    </p>
                  </>
                )}
              </div>

              <div style={{ 
                padding: '0.75rem', 
                background: 'rgba(79, 172, 115, 0.1)', 
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#4fac73',
                border: '1px solid rgba(79, 172, 115, 0.3)'
              }}>
                ℹ️ Se verificará que no haya conflictos en ninguna de las fechas antes de crear las reservas.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button"
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Creando...' : esRecurrente ? `Crear ${numSemanas} reservas` : 'Confirmar Reserva'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// VISTA DE MIS RESERVAS
// ============================================================================
function MisReservasView({ reservas, onUpdate }) {
  const [cancelando, setCancelando] = useState(null);

  const handleCancelar = async (reservaId) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta reserva?')) {
      return;
    }

    setCancelando(reservaId);
    try {
      const { error } = await supabase
        .from('reservas')
        .delete()
        .eq('id', reservaId);

      if (error) throw error;

      onUpdate();
    } catch (err) {
      alert('Error al cancelar la reserva: ' + err.message);
    } finally {
      setCancelando(null);
    }
  };

  if (reservas.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📅</div>
        <h2>No tienes reservas</h2>
        <p>Tus reservas aparecerán aquí cuando hagas una</p>
      </div>
    );
  }

  return (
    <div className="grid">
      {reservas.map(reserva => (
        <div key={reserva.id} className="card">
          <h3 className="card-title">{reserva.salones?.nombre}</h3>
          <p className="card-detail">
            <strong>Inicio:</strong> {new Date(reserva.fecha_inicio).toLocaleString('es-ES')}
          </p>
          <p className="card-detail">
            <strong>Fin:</strong> {new Date(reserva.fecha_fin).toLocaleString('es-ES')}
          </p>
          <p className="card-detail">
            <strong>Propósito:</strong> {reserva.proposito}
          </p>
          
          <button
            className="button button-danger"
            style={{ width: '100%', marginTop: '1rem' }}
            onClick={() => handleCancelar(reserva.id)}
            disabled={cancelando === reserva.id}
          >
            {cancelando === reserva.id ? 'Cancelando...' : 'Cancelar Reserva'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// PANEL DE ADMINISTRACIÓN
// ============================================================================
function AdminView({ salones, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSalon, setEditingSalon] = useState(null);
  const [adminTab, setAdminTab] = useState('salones'); // 'salones' o 'whitelist'

  const handleEdit = (salon) => {
    setEditingSalon(salon);
    setShowForm(true);
  };

  const handleDelete = async (salonId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este salón?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('salones')
        .delete()
        .eq('id', salonId);

      if (error) throw error;

      onUpdate();
    } catch (err) {
      alert('Error al eliminar el salón: ' + err.message);
    }
  };

  if (showForm) {
    return (
      <SalonForm
        salon={editingSalon}
        onClose={() => {
          setShowForm(false);
          setEditingSalon(null);
        }}
        onSuccess={() => {
          setShowForm(false);
          setEditingSalon(null);
          onUpdate();
        }}
      />
    );
  }

  return (
    <>
      {/* Tabs de administración */}
      <div className="nav-tabs" style={{ marginBottom: '2rem' }}>
        <button
          className={`tab-button ${adminTab === 'salones' ? 'active' : ''}`}
          onClick={() => setAdminTab('salones')}
        >
          🏢 Gestionar Salones
        </button>
        <button
          className={`tab-button ${adminTab === 'whitelist' ? 'active' : ''}`}
          onClick={() => setAdminTab('whitelist')}
        >
          ⚡ Whitelist de Usuarios
        </button>
      </div>

      {/* Vista de Salones */}
      {adminTab === 'salones' && (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <button
              className="button"
              onClick={() => setShowForm(true)}
            >
              + Crear Nuevo Salón
            </button>
          </div>

          {salones.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏢</div>
              <h2>No hay salones creados</h2>
              <p>Crea el primer salón para comenzar</p>
            </div>
          ) : (
            <div className="grid">
              {salones.map(salon => (
                <div key={salon.id} className="card">
                  <h3 className="card-title">{salon.nombre}</h3>
                  {salon.descripcion && (
                    <p className="card-detail">{salon.descripcion}</p>
                  )}
                  <p className="card-detail">
                    <strong>Capacidad:</strong> {salon.capacidad} personas
                  </p>
                  {salon.ubicacion && (
                    <p className="card-detail">
                      <strong>Ubicación:</strong> {salon.ubicacion}
                    </p>
                  )}
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      className="button button-secondary"
                      style={{ flex: 1 }}
                      onClick={() => handleEdit(salon)}
                    >
                      Editar
                    </button>
                    <button
                      className="button button-danger"
                      style={{ flex: 1 }}
                      onClick={() => handleDelete(salon.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Vista de Whitelist */}
      {adminTab === 'whitelist' && (
        <WhitelistManager />
      )}
    </>
  );
}

// ============================================================================
// GESTOR DE WHITELIST
// ============================================================================
function WhitelistManager() {
  const [whitelist, setWhitelist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadWhitelist();
  }, []);

  const loadWhitelist = async () => {
    try {
      const { data, error } = await supabase
        .from('whitelist')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setWhitelist(data || []);
    } catch (err) {
      console.error('Error cargando whitelist:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('whitelist')
        .insert([{
          email: newEmail.toLowerCase().trim(),
          notes: newNotes.trim() || null
        }]);

      if (error) {
        if (error.message.includes('unique')) {
          throw new Error('Este email ya está en la whitelist');
        }
        throw error;
      }

      setMessage({ type: 'success', text: '✅ Email agregado a la whitelist' });
      setNewEmail('');
      setNewNotes('');
      loadWhitelist();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id, email) => {
    if (!confirm(`¿Eliminar "${email}" de la whitelist?`)) return;

    try {
      const { error } = await supabase
        .from('whitelist')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: '✅ Email eliminado de la whitelist' });
      loadWhitelist();
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: '#666666' }}>Cargando whitelist...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(220, 20, 60, 0.05)', borderRadius: '12px' }}>
        <h3 style={{ color: '#C41E3A', marginBottom: '0.5rem' }}>⚡ ¿Qué es la Whitelist?</h3>
        <p style={{ color: '#666666', fontSize: '0.95rem', lineHeight: '1.6' }}>
          La whitelist es una lista de emails pre-aprobados. Los usuarios en esta lista reciben un <strong>proceso de acceso prioritario</strong> al hacer login, identificándolos como usuarios autorizados de la organización.
        </p>
      </div>

      {/* Formulario para agregar emails */}
      <div className="form-container" style={{ marginBottom: '2rem' }}>
        <h3 className="card-title">Agregar Email a Whitelist</h3>

        {message && (
          <div className={`message message-${message.type}`} style={{ marginBottom: '1rem' }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">Email del usuario</label>
            <input
              type="email"
              className="form-input"
              placeholder="usuario@ejemplo.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              disabled={adding}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notas (opcional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ej: Empleado del departamento X"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              disabled={adding}
            />
          </div>

          <button
            type="submit"
            className="button"
            disabled={adding}
            style={{ width: '100%' }}
          >
            {adding ? 'Agregando...' : '+ Agregar a Whitelist'}
          </button>
        </form>
      </div>

      {/* Lista de emails en whitelist */}
      <div>
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          Emails Aprobados ({whitelist.length})
        </h3>

        {whitelist.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h2>Whitelist vacía</h2>
            <p>Agrega el primer email para comenzar</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {whitelist.map(item => (
              <div
                key={item.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '1.5rem'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <strong style={{ color: '#C41E3A', fontSize: '1.1rem' }}>{item.email}</strong>
                  </div>
                  {item.notes && (
                    <p style={{ color: '#666666', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                      📝 {item.notes}
                    </p>
                  )}
                  <p style={{ color: '#999999', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    Agregado: {new Date(item.created_at).toLocaleDateString('es-ES', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <button
                  className="button button-danger"
                  onClick={() => handleDelete(item.id, item.email)}
                  style={{ marginLeft: '1rem' }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FORMULARIO DE SALÓN
// ============================================================================
function SalonForm({ salon, onClose, onSuccess }) {
  const [nombre, setNombre] = useState(salon?.nombre || '');
  const [descripcion, setDescripcion] = useState(salon?.descripcion || '');
  const [capacidad, setCapacidad] = useState(salon?.capacidad || '');
  const [ubicacion, setUbicacion] = useState(salon?.ubicacion || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const salonData = {
        nombre,
        descripcion,
        capacidad: parseInt(capacidad),
        ubicacion,
      };

      if (salon) {
        // Actualizar salón existente
        const { error: updateError } = await supabase
          .from('salones')
          .update(salonData)
          .eq('id', salon.id);

        if (updateError) throw updateError;
      } else {
        // Crear nuevo salón
        const { error: insertError } = await supabase
          .from('salones')
          .insert([salonData]);

        if (insertError) throw insertError;
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2 className="card-title">
        {salon ? 'Editar Salón' : 'Crear Nuevo Salón'}
      </h2>
      
      {error && (
        <div className="message message-error">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Nombre del salón *</label>
          <input
            type="text"
            className="form-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Sala de Juntas A"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Descripción</label>
          <textarea
            className="form-input"
            rows="3"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción del salón..."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Capacidad *</label>
          <input
            type="number"
            className="form-input"
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
            placeholder="Número de personas"
            min="1"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Ubicación</label>
          <input
            type="text"
            className="form-input"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="Ej: Piso 2, Edificio Principal"
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="button"
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? 'Guardando...' : salon ? 'Actualizar' : 'Crear Salón'}
          </button>
        </div>
      </form>
    </div>
  );
}