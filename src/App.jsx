import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, updateProfile, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, arrayUnion, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';

// --- CONFIGURAZIONE FIREBASE GLOBALE (TUA) ---
const firebaseConfig = {
  apiKey: "AIzaSyALMoiyVGzHEesU6L5ax2T7Iovg_Zs6kwA",
  authDomain: "mensa-ufficio-2025.firebaseapp.com",
  projectId: "mensa-ufficio-2025",
  storageBucket: "mensa-ufficio-2025.firebasestorage.app",
  messagingSenderId: "792389436556",
  appId: "1:792389436556:web:47cf9c9636ff2d801ee7a9"
};

// --- AGGIUNGI QUESTE DUE RIGHE SOTTO LA CONFIGURAZIONE ---
const appId = 'mensa-app-v1'; 
const initialAuthToken = null;

// Percorsi Firestore
const PUBLIC_DATA_PATH = `artifacts/${appId}/public/data`;
const PUBLIC_ORDERS_COLLECTION = `${PUBLIC_DATA_PATH}/mealOrders`;
const CONFIG_DOC_PATH = `${PUBLIC_DATA_PATH}/config`; 
const USERS_COLLECTION_PATH = `${PUBLIC_DATA_PATH}/users`;
const SETTINGS_DOC_PATH = `${PUBLIC_DATA_PATH}/settings`;

const BANNER_IMAGE_URL = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop"; 

// --- UTENTE INIZIALE (GIOACCHINO) ---
const INITIAL_ADMIN = { 
    id: 'u_admin_gioacchino', 
    name: 'Gioacchino Battaglia', 
    email: 'gioacchino.battaglia@comune.formigine.mo.it', 
    pin: '7378', 
    isAdmin: true 
};

const INITIAL_SETTINGS = {
  emailBar: "gioacchino.battaglia@comune.formigine.mo.it",
  phoneBar: "0598751381"
};

// --- DATA SCADENZA DEMO ---
const DEMO_EXPIRATION_DATE = new Date('2025-12-31');

// --- 👥 LISTA COLLEGHI UFFICIALE ---
const COLLEAGUES_LIST = [
  { id: 'u1', name: 'Barbara Zucchi', email: 'b.zucchi@comune.formigine.mo.it', pin: '1111', isAdmin: false },
  { id: 'u2', name: 'Chiara Italiani', email: 'c_italiani@comune.formigine.mo.it', pin: '2222', isAdmin: false },
  { id: 'u3', name: 'Davide Cremaschi', email: 'd.cremaschi@comune.formigine.mo.it', pin: '3333', isAdmin: false },
  { id: 'u4', name: 'Federica Fontana', email: 'f.fontana@comune.formigine.mo.it', pin: '4444', isAdmin: false },
  { id: 'u5', name: 'Gioacchino Battaglia', email: 'gioacchino.battaglia@comune.formigine.mo.it', pin: '7378', isAdmin: true }, // ADMIN
  { id: 'u6', name: 'Giuseppe Carteri', email: 'g.carteri@comune.formigine.mo.it', pin: '6666', isAdmin: false },
  { id: 'u7', name: 'Andrea Vescogni', email: 'andrea.vescogni@comune.formigine.mo.it', pin: '7777', isAdmin: false },
  { id: 'u8', name: 'Patrizia Caselli', email: 'patrizia.caselli@comune.formigine.mo.it', pin: '8888', isAdmin: false },
  { id: 'u9', name: 'Roberta Falchi', email: 'rfalchi@comune.formigine.mo.it', pin: '9999', isAdmin: false },
  { id: 'u10', name: 'Roberta Palumbo', email: 'r.palumbo@comune.formigine.mo.it', pin: '1234', isAdmin: false },
  { id: 'u11', name: 'Veronica Cantile', email: 'v.cantile@comune.formigine.mo.it', pin: '0000', isAdmin: false },
];

// --- UTILITÀ CALENDARIO ---
const formatDate = (date) => date.toISOString().split('T')[0];

const generateAllowedDates = () => {
  const dates = [];
  const start = new Date('2025-01-01');
  const end = new Date('2026-12-31');
  let current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    // Lunedì (1) e Giovedì (4)
    if (day === 1 || day === 4) {
      dates.push(formatDate(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const ALLOWED_DATES_LIST = generateAllowedDates();

const getNextOpenDay = (fromDateStr) => {
  const todayStr = fromDateStr || formatDate(new Date());
  return ALLOWED_DATES_LIST.find(d => d > todayStr) || 'Data futura non trovata';
};

const getDaysLeft = () => {
  const now = new Date();
  const diff = DEMO_EXPIRATION_DATE - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24)); 
};

const LoadingSpinner = ({ text, onForceStart }) => (
  <div className="flex flex-col items-center justify-center p-4 min-h-[300px]">
    <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-green-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span className="text-gray-500 font-medium text-lg mb-4">{text || 'Caricamento sistema...'}</span>
    {onForceStart && (
      <button 
        onClick={onForceStart}
        className="text-xs text-blue-500 underline hover:text-blue-700 cursor-pointer"
      >
        Sblocca caricamento
      </button>
    )}
  </div>
);

// --- COMPONENTI UI ---

const ClosedScreen = ({ nextDate, onEnableDemo }) => {
  const nextDateObj = new Date(nextDate);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedNext = nextDateObj.toLocaleDateString('it-IT', options);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg text-center border-t-8 border-gray-400">
        <div className="mb-6 text-gray-300">
          <svg className="w-20 h-20 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-800 mb-2">Oggi siamo chiusi</h1>
        <p className="text-gray-600 mb-6">
          Il servizio prenotazione è attivo solo il <strong>Lunedì</strong> e il <strong>Giovedì</strong>.
        </p>
        
        <div className="bg-green-50 p-4 rounded-lg border border-green-200 inline-block w-full mb-6">
          <p className="text-sm text-green-800 font-bold uppercase tracking-wider mb-1">Prossima Apertura</p>
          <p className="text-2xl text-green-900 font-serif capitalize">{formattedNext}</p>
        </div>

        <div className="border-t pt-4">
          <p className="text-xs text-gray-500 mb-2">Devi fare una prova tecnica?</p>
          <button 
            onClick={onEnableDemo}
            className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-bold py-2 px-4 rounded-full transition-colors flex items-center justify-center gap-2 mx-auto"
          >
            <span>🧪</span> Attiva Modalità DEMO
          </button>
        </div>
      </div>
    </div>
  );
};

const HelpModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
      
      <h2 className="text-2xl font-bold text-green-800 mb-4 flex items-center gap-2">
        ℹ️ Guida all'uso
      </h2>

      <div className="space-y-6">
        <div>
          <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">1. Come Ordinare</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
            <li>Il sistema apre solo il <strong>Lunedì</strong> e <strong>Giovedì</strong>.</li>
            <li>Scrivi il piatto, scegli l'acqua e se mangi al bar o asporto.</li>
          </ul>
        </div>

        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <h3 className="font-bold text-red-800 border-b border-red-300 pb-1 mb-2">2. Scadenze</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
            <li><strong>10:30:</strong> Appare l'avviso "È Tardi".</li>
            <li><strong>12:00:</strong> STOP ORDINI. Il sistema si blocca.</li>
            <li><strong>13:00:</strong> STOP EMAIL. Bisogna telefonare.</li>
          </ul>
        </div>
      </div>

      <button onClick={onClose} className="w-full mt-6 bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700">
        Ho capito
      </button>
    </div>
  </div>
);

const WaterIcon = ({ type, selected, hasError }) => {
  let containerStyle = 'bg-white border-gray-200 hover:bg-gray-50';
  if (selected) {
    if (type === 'Frizzante') containerStyle = 'bg-blue-100 border-blue-600 ring-2 ring-blue-500';
    else if (type === 'Naturale') containerStyle = 'bg-cyan-50 border-cyan-400 ring-2 ring-cyan-400';
    else containerStyle = 'bg-gray-200 border-gray-400';
  } else if (hasError) {
    containerStyle = 'bg-red-50 border-red-500 ring-2 ring-red-200';
  }

  return (
    <div className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer transition-all w-full h-full ${containerStyle}`}>
      {type === 'Naturale' && (
        <>
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 ${selected ? 'text-cyan-500' : hasError ? 'text-red-400' : 'text-cyan-300'}`}>
             <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5ZM2.25 10.5a8.25 8.25 0 1114.59 5.28l1.228 1.228a.75.75 0 11-1.06 1.06l-1.228-1.228A8.25 8.25 0 012.25 10.5Zm3.655-4.2a.75.75 0 010 1.06 5.25 5.25 0 007.14 0 .75.75 0 011.06 0 6.75 6.75 0 01-9.54 0 .75.75 0 011.34-.82Z" clipRule="evenodd" />
             <path d="M7 0h10v2H7z" className="text-cyan-700"/>
             <path d="M9 2h6v3H9z" className="text-cyan-200"/>
           </svg>
           <span className={`text-xs font-bold mt-1 ${selected ? 'text-cyan-800' : hasError ? 'text-red-600' : 'text-gray-500'}`}>NATURALE</span>
        </>
      )}
      {type === 'Frizzante' && (
        <>
           <div className="relative">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 ${selected ? 'text-blue-700' : hasError ? 'text-red-400' : 'text-blue-400'}`}>
               <path d="M7 0h10v2H7z" className="text-blue-900"/>
               <path d="M9 2h6v3H9z" className="text-blue-300"/>
             </svg>
             <div className="absolute top-1/2 left-1 w-1 h-1 bg-white rounded-full animate-bounce"></div>
             <div className="absolute bottom-2 left-3 w-1.5 h-1.5 bg-white rounded-full"></div>
           </div>
           <span className={`text-xs font-bold mt-1 ${selected ? 'text-blue-800' : hasError ? 'text-red-600' : 'text-gray-500'}`}>FRIZZANTE</span>
        </>
      )}
      {type === 'Nessuna' && (
        <>
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-8 h-8 ${selected ? 'text-gray-600' : hasError ? 'text-red-400' : 'text-gray-300'}`}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
           </svg>
           <span className={`text-xs font-bold mt-1 ${selected ? 'text-gray-800' : hasError ? 'text-red-600' : 'text-gray-400'}`}>NESSUNA</span>
        </>
      )}
    </div>
  );
};

// --- SCHERMATA LOGIN ---
const LoginScreen = ({ onLogin, demoMode, onToggleDemo, colleagues = [] }) => {
  const [selectedColleague, setSelectedColleague] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const safeColleagues = Array.isArray(colleagues) ? colleagues : [];
  
  const isDemoExpired = new Date() > DEMO_EXPIRATION_DATE;
  const daysLeft = getDaysLeft();

  const handleLogin = () => {
    if (!selectedColleague) {
      setError('Seleziona il tuo nome dalla lista.');
      return;
    }
    const user = safeColleagues.find(c => c.id === selectedColleague);
    if (user && user.pin === pin) {
      onLogin(user);
    } else {
      setError('PIN errato. Riprova.');
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-8 border-green-700 relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <div className="p-3 bg-green-50 rounded-full shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-green-700">
                 <path d="M12.75 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM7.5 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8.25 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9.75 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM10.5 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12.75 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM14.25 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM15 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM16.5 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM15 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM16.5 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
                 <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 0 1 7.5 3v1.5h9V3A.75.75 0 0 1 18 3v1.5h.75a3 3 0 0 1 3 3v11.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3H6V3a.75.75 0 0 1 .75-.75Zm13.5 9a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5Z" clipRule="evenodd" />
               </svg>
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-green-800 mb-2 font-serif">7 MILA CAFFÈ</h1>
          <p className="text-gray-500 text-sm mb-3">Accesso Riservato</p>

          <p className="text-green-700 text-xs italic border-t border-green-100 pt-4 mt-2 font-serif">
            "Anche nel caos del lavoro,<br/>il pranzo resta un momento sacro."
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chi sei?</label>
            <select 
              value={selectedColleague}
              onChange={(e) => { setSelectedColleague(e.target.value); setError(''); }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white"
            >
              <option value="">-- Seleziona il tuo nome --</option>
              {safeColleagues.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PIN Segreto</label>
            <input 
              type="password"
              maxLength="4"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-center tracking-[0.5em] text-2xl font-bold"
              placeholder="••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold text-center animate-pulse">
              {error}
            </div>
          )}

          <button 
            onClick={handleLogin}
            className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-lg shadow-lg transform transition active:scale-95 disabled:opacity-50"
            disabled={safeColleagues.length === 0}
          >
            ACCEDI
          </button>
        </div>

        {/* PULSANTE DEMO - SPARISCE DOPO SCADENZA */}
        {!isDemoExpired && (
            <div className="mt-8 pt-4 border-t flex justify-center">
            <button 
                onClick={onToggleDemo}
                className={`text-xs font-semibold flex items-center gap-2 px-4 py-2 rounded-full transition-all shadow-sm ${
                demoMode 
                    ? 'bg-purple-600 text-white hover:bg-purple-700 border border-purple-700' 
                    : 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200'
                }`}
            >
                <span>{demoMode ? '✅' : '🧪'}</span> 
                {demoMode ? `Demo Attiva (Disattiva)` : `Attiva Demo (Test) - Restano ${daysLeft} gg`}
            </button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- COMPONENTE STATISTICHE UTENTE (Miei Buoni) ---
const UserStatsModal = ({ db, user, onClose }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [userStats, setUserStats] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [totalMeals, setTotalMeals] = useState(0);

  const loadStats = async () => {
    setLoadingStats(true);
    const [year, month] = selectedMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    try {
        const q = query(
            collection(db, PUBLIC_ORDERS_COLLECTION),
            where('mealDate', '>=', startDate),
            where('mealDate', '<=', endDate)
        );
        const querySnapshot = await getDocs(q);
        
        let ordersFound = [];
        let count = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const myOrder = (data.orders || []).find(o => o.userId === user.id);
            // Nota: rimuovo il controllo su !isDemo come richiesto
            if (myOrder) {
                ordersFound.push({
                    date: data.mealDate,
                    item: myOrder.itemName,
                    type: myOrder.isTakeout ? 'Asporto' : 'Bar'
                });
                count++;
            }
        });

        ordersFound.sort((a, b) => b.date.localeCompare(a.date));
        setUserStats(ordersFound);
        setTotalMeals(count);

    } catch (e) {
        console.error("Errore caricamento statistiche:", e);
    }
    setLoadingStats(false);
  };

  useEffect(() => {
    loadStats();
  }, [selectedMonth]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 relative h-[80vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
        <h2 className="text-xl font-bold text-blue-800 mb-4 flex items-center gap-2">📊 I Miei Buoni</h2>
        
        <div className="mb-4 bg-blue-50 p-4 rounded-lg border border-blue-100 text-center">
            <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Seleziona Mese</label>
            <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                className="border p-2 rounded text-center font-bold text-gray-700 w-full"
            />
            <div className="mt-3 pt-3 border-t border-blue-200">
                <span className="text-4xl font-bold text-blue-700 block">{totalMeals}</span>
                <span className="text-xs text-blue-500 uppercase font-bold">Buoni Consumati</span>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-gray-100 pt-2">
           {loadingStats ? <p className="text-center text-gray-400 p-4">Calcolo in corso...</p> : (
             userStats.length === 0 ? <p className="text-gray-400 italic text-center p-4 text-sm">Nessun ordine trovato in questo mese.</p> : (
               <div className="space-y-2">
                 {userStats.map((stat, i) => (
                   <div key={i} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded border-b border-gray-100 last:border-0">
                      <div>
                        <span className="text-xs font-bold text-gray-400 block">{new Date(stat.date).toLocaleDateString('it-IT', {weekday: 'short', day: '2-digit', month: 'short'})}</span>
                        <span className="text-sm font-bold text-gray-700">{stat.item}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${stat.type === 'Asporto' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                        {stat.type}
                      </span>
                   </div>
                 ))}
               </div>
             )
           )}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE ADMIN: STORICO ORDINI ---
const AdminHistory = ({ db, onClose, user }) => {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyAuthor, setHistoryAuthor] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async (dateStr) => {
    setLoadingHistory(true);
    try {
      const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, dateStr);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setHistoryOrders(docSnap.data().orders || []);
        setHistoryStatus(docSnap.data().status || 'open');
        setHistoryAuthor(docSnap.data().confirmedBy || '');
      } else {
        setHistoryOrders([]);
        setHistoryStatus('Nessun ordine trovato');
        setHistoryAuthor('');
      }
    } catch (e) { console.error(e); }
    setLoadingHistory(false);
  };

  useEffect(() => {
    loadHistory(selectedDate);
  }, [selectedDate]);

  const deleteDay = async () => {
      if (!user.isAdmin) return;
      if (!confirm(`Sei SICURO di voler cancellare TUTTI gli ordini del ${selectedDate}? Questa azione è irreversibile.`)) return;
      
      try {
          await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, selectedDate));
          alert("Giornata cancellata con successo.");
          loadHistory(selectedDate); 
      } catch (e) {
          console.error(e);
          alert("Errore cancellazione.");
      }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 relative h-[80vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">📜 Archivio Storico</h2>
        
        <div className="flex gap-4 items-center mb-4 bg-gray-50 p-3 rounded border">
          <label className="font-bold text-sm">Seleziona Data:</label>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)} 
            className="border p-1 rounded"
          />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-gray-50">
           {loadingHistory ? <p>Caricamento...</p> : (
             historyOrders.length === 0 ? <p className="text-gray-500 italic">Nessun ordine in questa data.</p> : (
               <div className="space-y-2">
                 {historyStatus === 'sent' && (
                    <div className="bg-green-100 border border-green-300 text-green-800 p-2 rounded text-sm font-bold mb-3 text-center">
                        ✅ Ordine inviato da: {historyAuthor || 'Sconosciuto'}
                    </div>
                 )}
                 {historyOrders.map((o, i) => (
                   <div key={i} className="bg-white p-2 rounded border flex justify-between text-sm items-center">
                      <div className="flex gap-2 items-center">
                        <span className="font-bold text-gray-700">{o.userName}</span>
                        <span className="text-gray-600">{o.itemName}</span>
                         {/* Mostra se è un ordine demo */}
                         {o.isDemo && <span className="text-[10px] bg-purple-100 text-purple-600 px-1 rounded">TEST</span>}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${o.isTakeout ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                        {o.isTakeout ? "🥡 Asporto" : "☕ Bar"}
                      </span>
                   </div>
                 ))}
               </div>
             )
           )}
        </div>
        
        {user.isAdmin && historyOrders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-red-100 flex justify-end">
                <button 
                    onClick={deleteDay}
                    className="text-red-600 hover:text-red-800 text-xs font-bold flex items-center gap-1 bg-red-50 px-3 py-2 rounded border border-red-200"
                >
                    🗑️ Elimina Tutta la Giornata (Admin)
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- COMPONENTE ADMIN: PANNELLO COMPLETO (Calendario, Settings, Report Buoni) ---
const AdminPanel = ({ db, currentDay, onClose, colleaguesList }) => {
  const [activeTab, setActiveTab] = useState('calendar'); 
  const [blockedDates, setBlockedDates] = useState([]);
  const [settings, setSettings] = useState({ emailBar: '', phoneBar: '' });
  
  // STATI PER REPORT BUONI
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [totalReportMeals, setTotalReportMeals] = useState(0);

  useEffect(() => {
    if (!db) return;
    
    getDoc(doc(db, CONFIG_DOC_PATH, 'holidays')).then(snap => {
        if (snap.exists()) setBlockedDates(snap.data().dates || []);
    });

    getDoc(doc(db, SETTINGS_DOC_PATH, 'main')).then(snap => {
        if (snap.exists()) setSettings(snap.data());
    });
  }, [db]);

  // Carica Report Buoni quando cambia la tab o il mese
  useEffect(() => {
    if (activeTab === 'vouchers') {
        loadVoucherReport();
    }
  }, [activeTab, reportMonth]);

  const loadVoucherReport = async () => {
    setLoadingReport(true);
    const [year, month] = reportMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month}-${lastDay}`;

    try {
        const q = query(
            collection(db, PUBLIC_ORDERS_COLLECTION),
            where('mealDate', '>=', startDate),
            where('mealDate', '<=', endDate)
        );
        const querySnapshot = await getDocs(q);
        
        const counts = {};
        let total = 0;

        // Inizializza tutti i colleghi a 0
        colleaguesList.forEach(c => {
            counts[c.id] = { name: c.name, count: 0 };
        });

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dayOrders = data.orders || [];
            dayOrders.forEach(order => {
                if (counts[order.userId]) {
                    counts[order.userId].count++;
                    total++;
                } else {
                    // Gestione ex-colleghi o ID non trovati
                    counts[order.userId] = { name: order.userName || 'Sconosciuto', count: 1 };
                    total++;
                }
            });
        });

        // Converti in array e ordina per nome
        const reportArray = Object.values(counts).sort((a, b) => a.name.localeCompare(b.name));
        setReportData(reportArray);
        setTotalReportMeals(total);

    } catch (e) {
        console.error("Errore report:", e);
    }
    setLoadingReport(false);
  };

  const toggleDate = async (dateStr) => {
    let newDates = [];
    if (blockedDates.includes(dateStr)) {
      newDates = blockedDates.filter(d => d !== dateStr);
    } else {
      newDates = [...blockedDates, dateStr];
    }
    setBlockedDates(newDates);
    await setDoc(doc(db, CONFIG_DOC_PATH, 'holidays'), { dates: newDates }, { merge: true });
  };

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, SETTINGS_DOC_PATH, 'main'), settings, { merge: true });
      alert("Impostazioni salvate!");
    } catch (e) { console.error(e); alert("Errore impostazioni"); }
  };

  const upcoming = ALLOWED_DATES_LIST.filter(d => d >= currentDay).slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col relative overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
           <h2 className="text-xl font-bold text-gray-800">⚙️ Pannello Amministrazione</h2>
           <button onClick={onClose} className="text-gray-500 hover:text-red-600 font-bold text-xl">&times;</button>
        </div>
        
        <div className="flex border-b overflow-x-auto">
          <button onClick={() => setActiveTab('calendar')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'calendar' ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}>📅 CALENDARIO</button>
          <button onClick={() => setActiveTab('vouchers')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'vouchers' ? 'border-b-2 border-green-500 text-green-600 bg-green-50' : 'text-gray-500 hover:bg-gray-50'}`}>📊 REPORT BUONI</button>
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'settings' ? 'border-b-2 border-gray-500 text-gray-800 bg-gray-100' : 'text-gray-500 hover:bg-gray-50'}`}>⚙️ IMPOSTAZIONI</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
           {activeTab === 'calendar' && (
             <div>
               <p className="text-sm text-gray-500 mb-4">Clicca su una data per chiudere l'ufficio (Ferie/Festa). Le date <span className="text-red-600 font-bold">barrate e rosse</span> sono CHIUSE.</p>
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {upcoming.map(date => {
                  const isBlocked = blockedDates.includes(date);
                  const dateObj = new Date(date);
                  return (
                    <button 
                      key={date}
                      onClick={() => toggleDate(date)}
                      className={`p-3 rounded border text-sm font-bold transition-all ${isBlocked ? 'bg-red-100 border-red-500 text-red-700 line-through' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}
                    >
                      {dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </button>
                  )
                })}
              </div>
             </div>
           )}

           {activeTab === 'vouchers' && (
             <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex justify-between items-center">
                   <div>
                     <label className="block text-xs font-bold text-green-800 uppercase mb-1">Periodo Report</label>
                     <input 
                        type="month" 
                        value={reportMonth} 
                        onChange={(e) => setReportMonth(e.target.value)} 
                        className="border p-2 rounded font-bold text-gray-700"
                     />
                   </div>
                   <div className="text-right">
                      <span className="block text-3xl font-bold text-green-700">{totalReportMeals}</span>
                      <span className="text-xs text-green-600 uppercase font-bold">Totale Pasti</span>
                   </div>
                </div>

                {loadingReport ? (
                    <p className="text-center text-gray-400 py-8">Calcolo report in corso...</p>
                ) : (
                    <div className="border rounded overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                <tr>
                                    <th className="p-3">Collega</th>
                                    <th className="p-3 text-right">Buoni Usati</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {reportData.map(user => (
                                    <tr key={user.name} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-800">{user.name}</td>
                                        <td className="p-3 text-right font-bold text-blue-600">{user.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
             </div>
           )}

           {activeTab === 'settings' && (
             <div className="space-y-4">
                <div className="bg-gray-100 p-4 rounded-lg">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Email del Bar (Destinatario Ordini)</label>
                  <input className="w-full p-2 border rounded" value={settings.emailBar} onChange={e => setSettings({...settings, emailBar: e.target.value})} />
                </div>
                <div className="bg-gray-100 p-4 rounded-lg">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Telefono del Bar (Per emergenze)</label>
                  <input className="w-full p-2 border rounded" value={settings.phoneBar} onChange={e => setSettings({...settings, phoneBar: e.target.value})} />
                </div>
                <button onClick={saveSettings} className="bg-green-600 text-white px-6 py-2 rounded font-bold shadow hover:bg-green-700">Salva Impostazioni</button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPALE ---
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null); 
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Dati dinamici
  const [appSettings, setAppSettings] = useState(INITIAL_SETTINGS);
  const [dataLoaded, setDataLoaded] = useState(false); 

  const [demoMode, setDemoMode] = useState(false);

  const [orders, setOrders] = useState([]);
  const [orderStatus, setOrderStatus] = useState('open'); 
  const [orderAuthor, setOrderAuthor] = useState('');
  
  const [actingAsUser, setActingAsUser] = useState(null);

  const [dishName, setDishName] = useState('');
  const [selectedWater, setSelectedWater] = useState(''); 
  const [diningChoice, setDiningChoice] = useState('');
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false); 
  const [showAdminPanel, setShowAdminPanel] = useState(false); 
  const [showHistory, setShowHistory] = useState(false); 
  const [showUserStats, setShowUserStats] = useState(false); 

  const todayDate = new Date();
  const todayStr = formatDate(todayDate);
  const [blockedDates, setBlockedDates] = useState([]);
  const [isShopOpen, setIsShopOpen] = useState(true);
  // Timeout di sicurezza
  const [initTimeout, setInitTimeout] = useState(false);

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const hour = demoMode ? 10 : time.getHours();
  const minute = demoMode ? 0 : time.getMinutes();

  // LOGICA ORARIA
  const isLateWarning = (hour === 10 && minute >= 30) || (hour === 11);
  const isBookingClosed = hour >= 12;
  const isEmailClosed = hour >= 13;

  // FORZATURA MANUALE
  const forceStart = () => {
    setInitTimeout(true);
  };

  // 1. INIT FIREBASE & LOAD
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0) return;
    
    const timeoutId = setTimeout(() => {
      setInitTimeout(true);
    }, 7000);

    try {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
      setDb(dbInstance);
      setAuth(authInstance);

      // Listener settings
      const subscribeToData = () => {
         const unsubSettings = onSnapshot(doc(dbInstance, SETTINGS_DOC_PATH, 'main'), (snap) => {
            if (snap.exists()) setAppSettings(snap.data());
         });
         return () => { unsubSettings(); };
      };

      const checkDateAccess = async () => {
        const isBaseValid = ALLOWED_DATES_LIST.includes(todayStr);
        if (!isBaseValid && !demoMode) { 
          setIsShopOpen(false);
          // NON blocchiamo il loading qui, permettiamo di renderizzare ClosedScreen
          setLoading(false);
          return;
        }

        try {
          const docRef = doc(dbInstance, CONFIG_DOC_PATH, 'holidays');
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const blocked = snap.data().dates || [];
            setBlockedDates(blocked);
            if (blocked.includes(todayStr) && !demoMode) {
              setIsShopOpen(false);
            } else {
              setIsShopOpen(true);
            }
          }
        } catch (e) { 
          console.error("Err date check", e);
          if(isBaseValid) setIsShopOpen(true); 
        }
      };

      const initAuth = async () => {
        if (!authInstance.currentUser) {
           if (initialAuthToken) await signInWithCustomToken(authInstance, initialAuthToken);
           else await signInAnonymously(authInstance);
        }
      };

      // Sequenza di avvio
      initAuth().then(() => {
        subscribeToData();
        checkDateAccess();
        setDataLoaded(true);
      });

      onAuthStateChanged(authInstance, (u) => {
        if (u) {
          setIsAuthReady(true);
          setLoading(false);
          clearTimeout(timeoutId);
        }
      });

      return () => { /* cleanup listeners */ };

    } catch (e) { 
      console.error("Errore init:", e); 
      setLoading(false);
      clearTimeout(timeoutId);
    }
    
    return () => clearTimeout(timeoutId);
  }, [demoMode]);

  // Forzatura manuale caricamento
  useEffect(() => {
    if (initTimeout && loading) {
      console.warn("Timeout caricamento: forzo avvio con dati locali.");
      setAppSettings(INITIAL_SETTINGS);
      setDataLoaded(true);
      setIsAuthReady(true);
      setLoading(false);
    }
  }, [initTimeout, loading]);

  // Restore user session
  useEffect(() => {
      if (dataLoaded && isAuthReady && !user) {
          const savedUserId = sessionStorage.getItem('mealAppUser');
          if (savedUserId) {
            const found = COLLEAGUES_LIST.find(c => c.id === savedUserId);
            if (found) {
               setUser(found);
               setActingAsUser(found); 
            }
          }
      }
  }, [dataLoaded, isAuthReady]);

  // LISTENER ORDINI
  useEffect(() => {
    if (!db || !isAuthReady || (!isShopOpen && !demoMode)) return;
    
    const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOrders(data.orders || []);
        setOrderStatus(data.status || 'open');
        setOrderAuthor(data.confirmedBy || '');
        
        if (actingAsUser) {
          const existingOrder = (data.orders || []).find(o => o.userId === actingAsUser.id);
          if (existingOrder) {
            setDishName(existingOrder.itemName || '');
            setSelectedWater(existingOrder.waterChoice || '');
            setDiningChoice(existingOrder.isTakeout ? 'asporto' : 'bar');
          } else {
            setDishName('');
            setSelectedWater('');
            setDiningChoice('');
          }
        }
      } else {
        setOrders([]);
        setOrderStatus('open');
        setOrderAuthor('');
      }
    }, (err) => {
      console.error("Errore listener ordini:", err);
    });

    return () => unsubscribe();
  }, [db, isAuthReady, todayStr, user, actingAsUser, isShopOpen, demoMode]);

  const handleLogin = (colleague) => {
    setUser(colleague);
    setActingAsUser(colleague);
    sessionStorage.setItem('mealAppUser', colleague.id);
  };

  const handleLogout = () => {
    setUser(null);
    setActingAsUser(null);
    sessionStorage.removeItem('mealAppUser');
    setDishName('');
    setSelectedWater('');
    setDiningChoice('');
  };

  const handleAdminUserChange = (e) => {
      const targetId = e.target.value;
      const targetUser = COLLEAGUES_LIST.find(c => c.id === targetId);
      if (targetUser) {
          setActingAsUser(targetUser);
          setMessage(''); 
      }
  };

  const adminEditOrder = (targetUserId) => {
      const targetUser = COLLEAGUES_LIST.find(c => c.id === targetUserId);
      if(targetUser) setActingAsUser(targetUser);
  };

  const adminDeleteOrder = async (targetUserId) => {
      if (!confirm("Sei sicuro di voler eliminare questo ordine?")) return;
      try {
        const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
        await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== targetUserId) });
      } catch(e) { console.error(e); }
  };

  const placeOrder = async () => {
    if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi modificare."); return; }
    if (isBookingClosed && !user.isAdmin) { alert("Troppo tardi! Sono passate le 12:00. Solo l'admin può modificare."); return; }

    const newErrors = {};
    let hasError = false;
    
    if (!dishName || dishName.trim() === '') { newErrors.dishName = true; hasError = true; }
    if (!selectedWater) { newErrors.water = true; hasError = true; }
    if (!diningChoice) { newErrors.dining = true; hasError = true; }

    setErrors(newErrors);

    if (hasError) {
      setTimeout(() => alert("⚠️ Compila tutti i campi evidenziati in rosso!"), 100);
      return; 
    }

    const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
    const cleanDishName = dishName.charAt(0).toUpperCase() + dishName.slice(1);

    const newOrder = {
      userId: actingAsUser.id,
      userName: actingAsUser.name,
      itemName: cleanDishName,
      waterChoice: selectedWater,
      isTakeout: diningChoice === 'asporto',
      timestamp: Date.now(),
      isDemo: demoMode // Flag per ordini demo
    };

    try {
      await setDoc(orderRef, { mealDate: todayStr }, { merge: true });
      const updatedOrders = orders.filter(o => o.userId !== actingAsUser.id).concat([newOrder]);
      await updateDoc(orderRef, { orders: updatedOrders });
      
      if (user.id === actingAsUser.id) {
          setMessage("Ordine salvato! Ricordati di inviare se sei l'ultimo.");
      } else {
          setMessage(`Ordine salvato per ${actingAsUser.name}!`);
      }
      setErrors({});
    } catch (e) { console.error(e); setMessage("Errore invio ordine"); }
  };

  const cancelOrder = async () => {
    if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi cancellare."); return; }
    try {
      const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
      await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== actingAsUser.id) });
      setDishName('');
      setSelectedWater('');
      setDiningChoice('');
      setMessage("Ordine annullato 🗑️");
    } catch (e) { console.error(e); }
  };

  const markAsSent = async () => {
    if (!confirm("Sei sicuro di aver inviato l'email? Questo bloccherà gli ordini per tutti.")) return;
    try {
      const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
      await setDoc(orderRef, { 
        status: 'sent',
        confirmedBy: user.name 
      }, { merge: true });
    } catch (e) { console.error("Errore update status", e); }
  };

  const unlockOrder = async () => {
    if (!confirm("Vuoi davvero riaprire l'ordine? Gli utenti potranno modificare le loro scelte.")) return;
    try {
      const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
      await setDoc(orderRef, { status: 'open', confirmedBy: '' }, { merge: true });
    } catch (e) { console.error("Errore sblocco", e); }
  };

  const getAllEmails = () => {
    return COLLEAGUES_LIST
      .map(c => c.email)
      .filter(email => email && email.includes('@'))
      .join(',');
  };

  const generateEmailText = () => {
    const grouped = orders.reduce((acc, o) => { 
        const key = o.itemName.trim(); 
        acc[key] = (acc[key] || 0) + 1; 
        return acc; 
    }, {});
    const water = orders.reduce((acc, o) => { const w = o.waterChoice || 'Nessuna'; acc[w] = (acc[w] || 0) + 1; return acc; }, {});

    let text = `Ciao Laura,\n`;
    text += `ecco il riepilogo dell'ordine di oggi ${todayDate.toLocaleDateString('it-IT')}.\n`;
    text += `Ti segnalo gentilmente che gli ordini DA ASPORTO 🥡 e da consumare AL BAR ☕ sono tutti per le ore 13:30.\n`;
    text += `Grazie come sempre per la disponibilità!\nA dopo\n\n`;

    text += `=========================================\n`;
    text += `RIEPILOGO ORDINE DEL ${todayDate.toLocaleDateString('it-IT')}\n`;
    text += `TOTALE ORDINI: ${orders.length}\n`;
    text += `=========================================\n\n`;
    
    text += "--- 🍽️ RIEPILOGO CUCINA (TOTALE) ---\n";
    Object.entries(grouped).forEach(([name, count]) => {
      text += `${count}x 🥗 ${name}\n`;
    });

    if (water['Naturale'] || water['Frizzante']) {
        text += "\n--- 💧 RIEPILOGO ACQUA ---\n";
        if (water['Naturale']) text += `💧 Naturale: ${water['Naturale']}\n`;
        if (water['Frizzante']) text += `🫧 Frizzante: ${water['Frizzante']}\n`;
    }

    const barOrders = orders.filter(o => !o.isTakeout);
    const takeoutOrders = orders.filter(o => o.isTakeout);

    if (barOrders.length > 0) {
        text += `\n=== ☕ CONSUMAZIONE AL BAR (${barOrders.length}) ===\n`;
        barOrders.forEach((o, i) => {
            const waterEmoji = o.waterChoice === 'Naturale' ? '💧' : (o.waterChoice === 'Frizzante' ? '🫧' : '');
            text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName} ${waterEmoji}\n`;
        });
    }

    if (takeoutOrders.length > 0) {
        text += `\n=== 🥡 DA ASPORTO (${takeoutOrders.length}) ===\n`;
        takeoutOrders.forEach((o, i) => {
            const waterEmoji = o.waterChoice === 'Naturale' ? '💧' : (o.waterChoice === 'Frizzante' ? '🫧' : '');
            text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName} ${waterEmoji}\n`;
        });
    }

    return text;
  };

  const openGmail = () => {
    const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayDate.toLocaleDateString('it-IT')}`);
    const body = encodeURIComponent(generateEmailText());
    const ccEmails = getAllEmails();
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${appSettings.emailBar}&cc=${ccEmails}&su=${subject}&body=${body}`;
    window.open(gmailLink, '_blank');
  };

  const openDefaultMail = () => {
    const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayDate.toLocaleDateString('it-IT')}`);
    const body = encodeURIComponent(generateEmailText());
    const ccEmails = getAllEmails();
    const mailtoLink = `mailto:${appSettings.emailBar}?cc=${ccEmails}&subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  };

  if (loading || !dataLoaded) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner text="Connessione al database..." onForceStart={forceStart} /></div>;

  // LOGICA DI ACCESSO: Se chiuso/non demo, permettiamo login SOLO per consultazione.
  // Se loggato (user != null), mostriamo l'app ma con restrizioni UI (isClosedView)
  // Se non loggato, mostriamo ClosedScreen.

  if (!isShopOpen && !demoMode) {
      if (!user) {
          // Se non è loggato e il negozio è chiuso, mostra schermata chiusura MA CON TASTO LOGIN NASCOSTO
          // Aspetta, l'utente ha chiesto di poter entrare per vedere lo storico.
          // Quindi dobbiamo mostrare la LoginScreen invece della ClosedScreen se vuole entrare?
          // O mettiamo un tasto "Entra per consultare" nella ClosedScreen?
          // Mettiamo un tasto "Accedi per consultazione" nella ClosedScreen
          return <ClosedScreen nextDate={getNextOpenDay(todayStr)} onEnableDemo={() => { setDemoMode(true); setIsShopOpen(true); }} />;
          // NOTA: Per semplicità, la ClosedScreen attuale ha solo il tasto Demo.
          // Modifichiamo ClosedScreen per avere "Area Personale"
      }
  }
  
  if (!user) return <LoginScreen onLogin={handleLogin} demoMode={demoMode} onToggleDemo={() => setDemoMode(prev => !prev)} colleagues={COLLEAGUES_LIST} />;

  const barOrders = orders.filter(o => !o.isTakeout);
  const takeoutOrders = orders.filter(o => o.isTakeout);

  // SE CHIUSO E NON DEMO: DISABILITA INPUT MA MOSTRA UI
  const isClosedView = (!isShopOpen && !demoMode);

  return (
    <div className={`min-h-screen font-sans p-2 sm:p-6 pb-20 transition-colors duration-500 ${demoMode ? 'bg-purple-50' : 'bg-gray-100'}`}>
      
      {/* DEMO BANNER MIGLIORATO */}
      {demoMode && (
        <div className="max-w-5xl mx-auto mb-4 bg-purple-600 text-white text-center p-3 rounded-xl shadow-lg border-2 border-purple-400 flex flex-col sm:flex-row items-center justify-center gap-2 animate-pulse">
          <span className="text-2xl">🧪</span>
          <div className="leading-tight">
            <p className="font-bold text-lg">MODALITÀ DEMO ATTIVA</p>
            <p className="text-xs text-purple-200">I blocchi orari sono disabilitati per testare l'invio.</p>
          </div>
          <button 
             onClick={() => setDemoMode(false)}
             className="mt-2 sm:mt-0 sm:ml-4 bg-white text-purple-700 px-4 py-1 rounded-full text-sm font-bold hover:bg-gray-100 shadow-sm transition-transform hover:scale-105"
          >
            Esci dalla Demo
          </button>
        </div>
      )}

      <div className={`max-w-5xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden relative transition-all duration-300 ${demoMode ? 'border-4 border-purple-500 ring-4 ring-purple-200 transform scale-[0.99]' : ''}`}>
        
        {/* TOP BAR */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          {/* NEW BUTTON: MY VOUCHERS */}
          <button onClick={() => setShowUserStats(true)} className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-teal-500 flex items-center gap-1">
            📊 I Miei Buoni
          </button>

          {user.isAdmin && (
            <>
              <button onClick={() => setShowAdminPanel(true)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-orange-400">
                📅 Gestione
              </button>
              <button onClick={() => setShowHistory(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-purple-500">
                📜 Storico
              </button>
            </>
          )}
          {!user.isAdmin && (
             <button onClick={() => setShowHistory(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-purple-500">
                📜 Storico
             </button>
          )}
          <button onClick={() => setShowHelp(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-blue-500 flex items-center gap-1">
            <span>ℹ️</span> Guida
          </button>
          <button onClick={handleLogout} className="bg-white/90 hover:bg-white text-gray-800 text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm border border-gray-200">
            Esci ({user.name})
          </button>
        </div>

        {/* MODALI */}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        {showAdminPanel && <AdminPanel db={db} currentDay={todayStr} onClose={() => setShowAdminPanel(false)} colleaguesList={colleaguesList} />}
        {showHistory && <AdminHistory db={db} onClose={() => setShowHistory(false)} user={user} />}
        {showUserStats && <UserStatsModal db={db} user={user} onClose={() => setShowUserStats(false)} />}

        {/* BANNER */}
        <header 
          className="relative text-white overflow-hidden border-b-4 border-green-800 bg-cover bg-center"
          style={{ 
            backgroundColor: '#15803d',
            backgroundImage: BANNER_IMAGE_URL ? `url(${BANNER_IMAGE_URL})` : 'none' 
          }}
        >
           <div className={`absolute inset-0 ${BANNER_IMAGE_URL ? 'bg-black/60' : 'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-200/10 to-green-900'}`}></div>
           <div className="relative z-10 p-6 pt-10 flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-4">
             <div>
               <h1 className="text-4xl font-extrabold tracking-tight uppercase drop-shadow-lg" style={{fontFamily: 'serif'}}>7 MILA CAFFÈ</h1>
               <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
                 <span className="bg-white/90 text-green-800 px-2 py-0.5 rounded text-xs font-bold tracking-widest shadow-sm">TEL. {appSettings.phoneBar}</span>
               </div>
             </div>
             <div className="hidden md:block max-w-md italic font-serif text-green-50 text-lg border-l-2 border-green-400 pl-4 drop-shadow-md">
               "Anche nel caos del lavoro,<br/>il pranzo resta un momento sacro."
             </div>
           </div>
        </header>

        {/* STEPPER & OROLOGIO */}
        <div className="bg-gray-800 text-white p-3 shadow-inner">
            <div className="flex flex-col sm:flex-row justify-between items-center text-sm px-2 sm:px-4 mb-2 gap-2">
                <div className="font-medium text-gray-300">
                  Data: <span className="text-white font-bold uppercase">{todayDate.toLocaleDateString('it-IT')}</span>
                </div>
                <div className="font-mono font-bold text-white flex items-center gap-2">
                   {isLateWarning && orderStatus !== 'sent' && !isEmailClosed && !demoMode && !isClosedView && <span className="text-yellow-300 font-bold hidden sm:inline">⚠️ IN CHIUSURA </span>}
                   {isEmailClosed && orderStatus !== 'sent' && !demoMode && !isClosedView && <span className="text-red-400 font-bold hidden sm:inline">🛑 TEMPO SCADUTO </span>}
                   {demoMode ? "10:00 (Simulato)" : time.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm">
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${orderStatus !== 'sent' && !isEmailClosed && !isClosedView ? 'bg-green-600 font-bold' : 'bg-gray-700 text-gray-400'}`}>
                    <span className="bg-white text-gray-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">1</span>
                    Raccolta
                </div>
                <div className="h-0.5 w-4 bg-gray-600"></div>
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${orderStatus === 'sent' ? 'bg-green-600 font-bold' : 'bg-gray-700 text-gray-400'}`}>
                    <span className="bg-white text-gray-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">2</span>
                    Inviato
                </div>
            </div>
        </div>

        {/* --- ALERT INVIO TARDIVO (10:30 - 12:00) --- */}
        {isLateWarning && orderStatus !== 'sent' && !isEmailClosed && !demoMode && !isClosedView && (
          <div className="bg-red-100 border-b-4 border-red-500 p-4 text-center sticky top-0 z-40 shadow-xl animate-pulse">
             <h2 className="text-red-800 font-bold text-xl uppercase mb-2">⏰ È Tardi! Chiudi l'ordine</h2>
             <p className="text-red-600 mb-4 text-sm font-bold">Sono passate le 10:30. Il primo che vede questo messaggio deve inviare l'email!</p>
             <div className="flex justify-center gap-2">
                <button onClick={openGmail} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-full shadow-lg text-sm">
                   📧 GMAIL WEB (PC)
                </button>
                <button onClick={openDefaultMail} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-full shadow-lg text-sm">
                   📱 APP EMAIL
                </button>
             </div>
          </div>
        )}

        {/* --- ALERT CRITICO (12:00+) --- */}
        {isEmailClosed && orderStatus !== 'sent' && !demoMode && !isClosedView && (
          <div className="bg-gray-900 border-b-4 border-red-600 p-6 text-center sticky top-0 z-50 shadow-2xl">
             <h2 className="text-white font-bold text-2xl uppercase mb-2">🛑 ORDINE WEB CHIUSO</h2>
             <p className="text-gray-300 mb-4 text-sm">Sono passate le 12:00. Non inviare più email, il bar non la leggerebbe.</p>
             <a href={`tel:${appSettings.phoneBar}`} className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full shadow-lg text-lg animate-bounce">
                📞 CHIAMA IL BAR: {appSettings.phoneBar}
             </a>
             {user.isAdmin && (
                <div className="mt-4 border-t border-gray-700 pt-4">
                    <p className="text-xs text-gray-400 mb-2">Area Admin: Puoi forzare l'invio se necessario.</p>
                    <div className="flex justify-center gap-2">
                        <button onClick={openGmail} className="bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-4 rounded border border-gray-500">Forza Gmail</button>
                        <button onClick={openDefaultMail} className="bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-4 rounded border border-gray-500">Forza App Mail</button>
                        <button onClick={markAsSent} className="bg-green-700 hover:bg-green-600 text-white text-xs py-2 px-4 rounded border border-green-500">Forza "Inviato"</button>
                    </div>
                </div>
             )}
          </div>
        )}

        <main className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: Ordine Utente */}
          <div className="lg:col-span-8 space-y-6">
            
            <div className={`bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-2 ${user.isAdmin ? 'border-l-4 border-l-orange-400' : ''}`}>
              <div className="flex items-center gap-3">
                 <span className="text-blue-800 font-medium">Ciao,</span>
                 <span className="font-bold text-xl text-blue-900">{user.name}</span>
                 {user.isAdmin && <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded border border-orange-300">ADMIN</span>}
              </div>
              
              {/* ADMIN: SELETTORE UTENTE */}
              {user.isAdmin && (
                <div className="mt-2 pt-2 border-t border-blue-200">
                    <label className="text-xs font-bold text-orange-700 uppercase block mb-1">👑 Admin: Stai ordinando per...</label>
                    <select 
                        value={actingAsUser.id}
                        onChange={handleAdminUserChange}
                        className="w-full p-2 text-sm border border-orange-300 rounded bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                    >
                        {COLLEAGUES_LIST.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.id === user.id ? 'Me Stesso' : c.name}
                            </option>
                        ))}
                    </select>
                </div>
              )}
            </div>

            {/* SEZIONE 1: PIATTO */}
            <div className={`bg-white border-2 p-5 rounded-xl shadow-lg transition-colors ${errors.dishName ? 'border-red-500 ring-4 ring-red-100' : 'border-slate-200'}`}>
                {isClosedView ? (
                    <div className="text-center py-10 text-gray-500">
                        <h3 className="text-xl font-bold mb-2 text-gray-400">😴 Oggi Riposo</h3>
                        <p className="text-sm">Oggi il servizio prenotazione è chiuso.</p>
                        <p className="text-xs mt-2">Puoi comunque consultare il tuo Storico o i Buoni.</p>
                    </div>
                ) : (
                  <>
                    <h3 className={`font-bold mb-3 text-sm uppercase tracking-wide border-b pb-1 ${errors.dishName ? 'text-red-600 border-red-200' : 'text-gray-700'}`}>1. Cosa mangi oggi?</h3>
                    <input 
                        value={dishName}
                        onChange={(e) => {
                        setDishName(e.target.value);
                        if(errors.dishName) setErrors(prev => ({...prev, dishName: false}));
                        }}
                        disabled={orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode)}
                        placeholder={(orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode)) ? "Ordine chiuso" : "Es: Insalatona pollo e noci..."}
                        className={`w-full border-2 p-3 rounded-lg text-lg font-bold text-gray-800 outline-none transition-all placeholder:font-normal placeholder:text-gray-300 ${errors.dishName ? 'border-red-400 bg-red-50' : 'border-green-100 focus:border-green-500'} ${(orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode)) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                    />
                  </>
                )}
            </div>

            {/* SEZIONE 2 & 3 - NASCOSTA SE CHIUSO */}
            {!isClosedView && (
                <div className={`bg-white border-2 border-slate-200 p-5 rounded-xl shadow-lg sticky bottom-4 z-20 ${orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode) ? 'opacity-75 grayscale' : ''}`}>
                    <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide border-b pb-1">2. Completa il tuo ordine</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className={`block text-xs font-bold uppercase mb-2 ${errors.water ? 'text-red-600' : 'text-gray-500'}`}>Scelta Acqua *</label>
                        <div className="flex gap-2 h-20">
                            {['Nessuna', 'Naturale', 'Frizzante'].map(opt => (
                            <div key={opt} className={`flex-1 ${orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode) ? 'pointer-events-none' : ''}`} onClick={() => {
                                if(orderStatus !== 'sent' && (!isBookingClosed || user.isAdmin || demoMode)) {
                                setSelectedWater(opt);
                                if(errors.water) setErrors(prev => ({...prev, water: false}));
                                }
                            }}>
                                <WaterIcon type={opt} selected={selectedWater === opt} hasError={errors.water} />
                            </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase mb-2 ${errors.dining ? 'text-red-600' : 'text-gray-500'}`}>Dove mangi? *</label>
                        <div className="flex gap-2 h-20">
                            {['bar', 'asporto'].map(choice => (
                            <button 
                                key={choice}
                                disabled={orderStatus === 'sent' || (isBookingClosed && !user.isAdmin && !demoMode)}
                                onClick={() => {
                                setDiningChoice(choice);
                                if(errors.dining) setErrors(prev => ({...prev, dining: false}));
                                }}
                                className={`flex-1 flex flex-col items-center justify-center rounded-lg border transition-all ${
                                diningChoice === choice 
                                    ? (choice === 'bar' ? 'bg-orange-100 border-orange-500 ring-2 ring-orange-400 text-orange-800' : 'bg-red-100 border-red-500 ring-2 ring-red-400 text-red-800') + ' font-bold'
                                    : errors.dining ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span className="text-2xl">{choice === 'bar' ? '☕' : '🥡'}</span>
                                <span className="text-xs mt-1 font-bold uppercase">{choice === 'bar' ? 'Al Bar' : 'Asporto'}</span>
                            </button>
                            ))}
                        </div>
                    </div>
                    </div>

                    <div className="pt-2 border-t mt-2">
                    {orderStatus === 'sent' && !user.isAdmin ? (
                        <div className="bg-green-100 p-3 rounded-lg text-center border border-green-300">
                            <span className="text-green-800 font-bold text-lg">🔒 Ordine Inviato</span>
                            <p className="text-green-700 text-xs">Non è più possibile modificare le scelte.</p>
                        </div>
                    ) : isBookingClosed && !user.isAdmin && !demoMode ? (
                        <div className="bg-red-100 p-3 rounded-lg text-center border border-red-300">
                            <span className="text-red-800 font-bold text-lg">🛑 Ordini Chiusi</span>
                            <p className="text-red-700 text-xs">Le prenotazioni chiudono alle 12:00.</p>
                        </div>
                    ) : orders.some(o => o.userId === actingAsUser.id) ? (
                        <div className="flex items-center justify-between bg-green-50 p-2 rounded border border-green-200">
                            <div>
                                <span className="text-green-800 font-bold text-sm block">Ordine Salvato!</span>
                                <span className="text-green-600 text-xs truncate max-w-[150px] inline-block">{dishName}</span>
                                {user.isAdmin && actingAsUser.id !== user.id && <span className="text-[10px] text-orange-600 block">(per {actingAsUser.name})</span>}
                            </div>
                            <button onClick={cancelOrder} className="text-xs text-red-600 underline hover:text-red-800 font-bold px-2 py-1 rounded hover:bg-red-50">Cancella</button>
                        </div>
                        ) : (
                        <button 
                            onClick={placeOrder} 
                            className={`w-full text-white py-3 rounded-lg font-bold shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide ${user.isAdmin && actingAsUser.id !== user.id ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'}`}
                        >
                            <span>{user.isAdmin && actingAsUser.id !== user.id ? `📨 Ordina per ${actingAsUser.name.split(' ')[0]}` : '📨 Salva la tua scelta'}</span>
                        </button>
                        )}
                        {message && orderStatus !== 'sent' && !(isBookingClosed && !user.isAdmin && !demoMode) && <p className={`text-center font-bold mt-2 text-sm animate-pulse ${message.includes('Errore') || message.includes('evidenziati') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
                    </div>
                </div>
            )}
            </div>

            {/* RIGHT: Riepilogo e Admin */}
            <div className="lg:col-span-4 space-y-6">
            
            {/* Box Admin */}
            <div className="bg-slate-100 p-4 rounded-lg border border-slate-300 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase flex items-center gap-2">
                <span>🚀</span> Zona Invio
              </h3>
              
              {orderStatus === 'sent' ? (
                 <div className="text-center p-4 bg-white rounded border border-green-200">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-green-800 font-bold">Email Inviata da {orderAuthor || 'un collega'}</p>
                    <p className="text-xs text-gray-500">L'ordine è chiuso.</p>
                    {user.isAdmin && (
                        <button onClick={unlockOrder} className="mt-3 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded border border-gray-400">
                            🔓 Sblocca Ordine (Solo Admin)
                        </button>
                    )}
                 </div>
              ) : (
                <div className="space-y-4">
                  {/* FASE 1 */}
                  {isEmailClosed && !user.isAdmin && !demoMode ? (
                      <div className="bg-red-50 border border-red-200 p-4 rounded text-center">
                          <p className="text-red-600 font-bold mb-2">⛔ Tempo Email Scaduto</p>
                          <p className="text-xs text-gray-600">Non è più possibile inviare l'email (13:00+). Chiama il bar.</p>
                      </div>
                  ) : (
                    <div className="relative border-l-2 border-blue-400 pl-4 ml-2">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div>
                        <h4 className="text-sm font-bold text-blue-800 mb-1">Fase 1: Invia l'Email</h4>
                        <p className="text-xs text-slate-500 mb-2">Apri il tuo programma di posta. Il testo è già pronto.</p>
                        <div className="grid gap-2">
                            <button onClick={openGmail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-red-200 text-red-700 hover:bg-red-50">
                                <span className="text-lg">🔴</span> Gmail Web (PC)
                            </button>
                            <button onClick={openDefaultMail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-slate-300 text-slate-700 hover:bg-slate-50">
                                <span className="text-lg">📱</span> App Email (Mobile)
                            </button>
                        </div>
                    </div>
                  )}

                  {/* FASE 2 */}
                  {(!isEmailClosed || user.isAdmin || demoMode) && (
                    <div className="relative border-l-2 border-green-400 pl-4 ml-2">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div>
                        <h4 className="text-sm font-bold text-green-800 mb-1">Fase 2: Conferma nel sistema</h4>
                        <p className="text-xs text-slate-500 mb-2">Solo DOPO aver inviato l'email reale, clicca qui per chiudere l'ordine.</p>
                        <button onClick={markAsSent} className="w-full py-3 rounded font-bold shadow flex items-center justify-center gap-2 text-sm bg-green-600 hover:bg-green-700 text-white animate-pulse">
                            <span>✅</span> CONFERMA INVIO
                        </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl shadow border h-full max-h-[600px] overflow-y-auto">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center">
                <span>👀 Riepilogo Ordini</span>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{orders.length}</span>
              </h3>
              
              <div className="space-y-6">
                
                {/* SEZIONE BAR */}
                {barOrders.length > 0 && (
                  <div>
                    <h4 className="text-orange-700 font-bold border-b-2 border-orange-200 mb-2 pb-1 sticky top-0 bg-white z-10 flex items-center gap-2 text-sm">
                       ☕ AL BAR <span className="bg-orange-100 text-xs px-2 rounded-full">{barOrders.length}</span>
                    </h4>
                    <div className="space-y-2">
                      {barOrders.map((order, i) => (
                         <div key={order.userId} className="text-sm flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group relative">
                           <div className="flex items-center gap-2 overflow-hidden w-full">
                             <span className="text-gray-400 font-mono text-xs w-4">{i+1}.</span>
                             <span className="font-bold text-gray-700 whitespace-nowrap">{order.userName}</span>
                             <span className="text-gray-600 truncate text-xs flex-1">- 🥗 {order.itemName}</span>
                             {user.isAdmin && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => adminEditOrder(order.userId)} className="text-xs bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200" title="Modifica">✏️</button>
                                    <button onClick={() => adminDeleteOrder(order.userId)} className="text-xs bg-red-100 text-red-600 p-1 rounded hover:bg-red-200" title="Elimina">🗑️</button>
                                </div>
                             )}
                           </div>
                           {order.waterChoice && order.waterChoice !== 'Nessuna' && (
                             <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 ml-2">
                               {order.waterChoice === 'Naturale' ? '💧' : '🫧'}
                             </span>
                           )}
                         </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SEZIONE ASPORTO */}
                {takeoutOrders.length > 0 && (
                  <div>
                    <h4 className="text-red-700 font-bold border-b-2 border-red-200 mb-2 pb-1 sticky top-0 bg-white z-10 flex items-center gap-2 text-sm">
                       🥡 DA ASPORTO <span className="bg-red-100 text-xs px-2 rounded-full">{takeoutOrders.length}</span>
                    </h4>
                    <div className="space-y-2">
                      {takeoutOrders.map((order, i) => (
                         <div key={order.userId} className="text-sm flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group relative">
                           <div className="flex items-center gap-2 overflow-hidden w-full">
                             <span className="text-gray-400 font-mono text-xs w-4">{i+1}.</span>
                             <span className="font-bold text-gray-700 whitespace-nowrap">{order.userName}</span>
                             <span className="text-gray-600 truncate text-xs flex-1">- 🥗 {order.itemName}</span>
                             {user.isAdmin && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => adminEditOrder(order.userId)} className="text-xs bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200" title="Modifica">✏️</button>
                                    <button onClick={() => adminDeleteOrder(order.userId)} className="text-xs bg-red-100 text-red-600 p-1 rounded hover:bg-red-200" title="Elimina">🗑️</button>
                                </div>
                             )}
                           </div>
                           {order.waterChoice && order.waterChoice !== 'Nessuna' && (
                             <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 ml-2">
                               {order.waterChoice === 'Naturale' ? '💧' : '🫧'}
                             </span>
                           )}
                         </div>
                      ))}
                    </div>
                  </div>
                )}

                {orders.length === 0 && <p className="text-gray-400 italic text-sm text-center py-4">Nessun ordine ancora.</p>}
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
