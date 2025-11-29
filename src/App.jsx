import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, updateDoc, deleteDoc } from 'firebase/firestore';

// --- VARIABILI GLOBALI E INIZIALIZZAZIONE FIREBASE (Adatto per Vercel/Canvas) ---

// Determina se stiamo eseguendo il codice all'interno dell'ambiente Canvas
const isCanvasEnvironment = typeof __firebase_config !== 'undefined' && __firebase_config !== null;

// Configurazione Firebase: legge le variabili globali di Canvas o le Variabili d'Ambiente di Vercel
const firebaseConfig = isCanvasEnvironment ? 
    JSON.parse(__firebase_config) : 
    {
        apiKey: process.env.REACT_APP_API_KEY,
        authDomain: process.env.REACT_APP_AUTH_DOMAIN,
        projectId: process.env.REACT_APP_PROJECT_ID,
        storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
        messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
        appId: process.env.REACT_APP_APP_ID, // Questo è il campo chiave
    };

// L'App ID per i percorsi Firestore (usa l'ID Canvas o, in Vercel, il Project ID)
const appId = isCanvasEnvironment ? 
    (typeof __app_id !== 'undefined' ? __app_id : 'default-app-id') : 
    (firebaseConfig.projectId || 'default-vercel-id'); 

const initialAuthToken = isCanvasEnvironment ? 
    (typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null) : 
    null; 

let db;
let auth;

if (firebaseConfig && firebaseConfig.projectId) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    // console.log("Firebase initialized successfully.");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
  }
} else {
  console.warn("Firebase config not available. App will run in mock mode.");
}

// --- PERCORSI FIREBASE (Correzione Struttura: Uso Reference) ---
// La base è una Collection (artifacts/{appId}/public/data/collectionName)
const BASE_CONFIG_COLLECTION = db ? collection(db, `/artifacts/${appId}/public/data/config`) : null;
const BASE_ORDERS_COLLECTION = db ? collection(db, `/artifacts/${appId}/public/data/mealOrders`) : null;

// Riferimenti a Documenti specifici
const SETTINGS_DOC_REF = BASE_CONFIG_COLLECTION ? doc(BASE_CONFIG_COLLECTION, 'main') : null;
const HOLIDAYS_DOC_REF = BASE_CONFIG_COLLECTION ? doc(BASE_CONFIG_COLLECTION, 'holidays') : null;
const DAILY_MENU_DOC_REF = BASE_CONFIG_COLLECTION ? doc(BASE_CONFIG_COLLECTION, 'dailyMenu') : null;
// Riferimento al documento che tiene traccia dell'UID Firebase dell'Admin
const ADMIN_UID_DOC_REF = BASE_CONFIG_COLLECTION ? doc(BASE_CONFIG_COLLECTION, 'adminUser') : null; 

const BANNER_IMAGE_URL = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop"; 

// --- 👥 LISTA COLLEGHI UFFICIALE (GESTITA DA CODICE) ---
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

const INITIAL_SETTINGS = {
  emailBar: "gioacchino.battaglia@comune.formigine.mo.it",
  phoneBar: "0598751381"
};

// Variabile utile per le Regole di Sicurezza, se l'utente ADMIN usa un PIN hardcoded,
// il suo UID sarà l'unico con i permessi di scrittura sul DB di CONFIG.
const USER_ADMIN_ID = 'u5'; 

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
        Ci mette troppo? Clicca qui per avviare comunque.
      </button>
    )}
  </div>
);

// --- COMPONENTI UI ---

const HelpModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
      
      <h2 className="text-2xl font-bold text-green-800 mb-4 flex items-center gap-2">
        ℹ️ Guida Rapida all'App
      </h2>

      <div className="space-y-6">
        <div>
          <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">1. Funzionamento Principale</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
            <li>L'app è attiva solo il **Lunedì** e il **Giovedì**. Negli altri giorni, puoi solo vedere lo storico.</li>
            <li>Chiunque può inserire il proprio ordine in autonomia.</li>
            <li>**Blocco Totale:** L'ordine si considera chiuso e nello storico solo dopo che è stato inviato via email al Bar e confermato.</li>
          </ul>
        </div>

        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <h3 className="font-bold text-red-800 border-b border-red-300 pb-1 mb-2">2. Il Flusso di Invio (CRITICO!)</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
            <li>**Passaggio 1 (Invia Email):** Un collega (il primo che vede l'avviso "È Tardi" o l'Admin) clicca per aprire l'email con l'ordine aggregato. **Deve inviarla.**</li>
            <li>**Passaggio 2 (Conferma Blocco):** Subito dopo aver spedito l'email, lo stesso collega DEVE cliccare "CONFERMA INVIO E BLOCCA". Questo blocca il form per tutti e salva l'ordine nello storico.</li>
          </ul>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 className="font-bold text-yellow-800 border-b border-yellow-300 pb-1 mb-2">3. Scadenze Orarie</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-yellow-700">
            <li>**10:30:** Appare l'avviso rosso "È Tardi". Iniziare la procedura di invio!</li>
            <li>**11:59:** **STOP ORDINI!** Non è più possibile scegliere o modificare il piatto.</li>
            <li>**12:00:** **STOP EMAIL!** L'invio via app è bloccato. Si può solo telefonare al Bar.</li>
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
const LoginScreen = ({ onLogin, colleagues = [] }) => {
  const [selectedColleague, setSelectedColleague] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const safeColleagues = Array.isArray(colleagues) ? colleagues : [];

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
        <div 
          className="text-center mb-8 relative h-32 rounded-lg overflow-hidden bg-cover bg-center flex items-center justify-center"
          style={{ 
            backgroundImage: `url(${BANNER_IMAGE_URL})`,
            backgroundColor: '#15803d'
          }}
        >
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white p-4">
            <h1 className="text-3xl font-extrabold tracking-tight uppercase drop-shadow-lg font-serif">7 MILA CAFFÈ</h1>
            <p className="text-green-200 text-xs italic mt-1 font-serif">
              "Anche nel caos del lavoro, il pranzo resta un momento sacro."
            </p>
            {/* Aggiungo il telefono qui nel login per completezza */}
            <span className="bg-white/90 text-green-800 px-2 py-0.5 rounded text-xs font-bold tracking-widest shadow-sm mt-2">TEL. {INITIAL_SETTINGS.phoneBar}</span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-green-600"><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
              Chi sei?
            </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-green-600"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-6 2.25h18a2.25 2.25 0 0 0 2.25-2.25v-1.375c0-1.172-.948-2.125-2.125-2.125H3.375A2.25 2.25 0 0 0 1.125 10.5v1.375c0 1.172.948 2.125 2.125 2.125Z" /></svg>
              PIN Segreto
            </label>
            <input 
              type="password"
              maxLength="4"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
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
            disabled={!selectedColleague || pin.length !== 4}
          >
            ACCEDI
          </button>
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

  const loadHistory = useCallback(async (dateStr) => {
    if (!db || !BASE_ORDERS_COLLECTION) return;
    setLoadingHistory(true);
    try {
      // CORRETTO: doc(CollectionRef, docId)
      const docRef = doc(BASE_ORDERS_COLLECTION, dateStr);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Lo storico legge i dati salvati dal markAsSent
        const orders = data.historyOrders || []; // Legge dalla chiave historyOrders
        setHistoryOrders(orders);
        setHistoryStatus(data.status || 'open');
        setHistoryAuthor(data.confirmedBy || '');
      } else {
        setHistoryOrders([]);
        setHistoryStatus('Nessun ordine trovato');
        setHistoryAuthor('');
      }
    } catch (e) { 
        console.error("Errore caricamento storico:", e);
        setHistoryOrders([]);
    }
    setLoadingHistory(false);
  }, [db]);

  useEffect(() => {
    loadHistory(selectedDate);
  }, [selectedDate, loadHistory]);

  const deleteDay = async () => {
      if (!user.isAdmin) return;
      if (!window.confirm(`Sei SICURO di voler cancellare TUTTI i dati relativi al ${selectedDate}? Questa azione è irreversibile.`)) return;
      
      try {
          // CORRETTO: doc(CollectionRef, docId)
          await deleteDoc(doc(BASE_ORDERS_COLLECTION, selectedDate));
          alert("Giornata cancellata con successo.");
          loadHistory(selectedDate); 
      } catch (e) {
          console.error(e);
          alert("Errore cancellazione.");
      }
  };
  
  // Aggiunto per evitare lo spinner infinito se il caricamento fallisce ma è in corso
  if (loadingHistory) return <p className="text-center py-8 text-gray-500">Caricamento storico...</p>

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
            {historyOrders.length === 0 ? <p className="text-gray-500 italic">Nessun ordine in questa data.</p> : (
                <div className="space-y-2">
                  {historyStatus === 'sent' && (
                    <div className="bg-green-100 border border-green-300 text-green-800 p-2 rounded text-sm font-bold mb-3 text-center">
                        ✅ Ordine inviato da: {historyAuthor || 'Sconosciuto'}
                    </div>
                  )}
                  {historyOrders.map((o, i) => (
                    <div key={i} className="text-sm flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group relative">
                      <div className="flex gap-2 items-center">
                        <span className="font-bold text-gray-700">{o.userName}</span>
                        <span className="text-gray-600">{o.itemName}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded font-bold ${o.isTakeout ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>
                        {o.isTakeout ? "🥡 Asporto" : "☕ Bar"}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
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

// --- COMPONENTE ADMIN: PANNELLO COMPLETO ---
const AdminPanel = ({ db, currentDay, onClose, colleaguesList, onToggleForceOpen, isForceOpen }) => {
  const [activeTab, setActiveTab] = useState('calendar'); 
  const [blockedDates, setBlockedDates] = useState([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [errorLoading, setErrorLoading] = useState(false); // Nuovo stato per gli errori

  // Load blocked dates and settings
  useEffect(() => {
    if (!db || !SETTINGS_DOC_REF || !HOLIDAYS_DOC_REF) {
        setLoading(false);
        setErrorLoading(true); // Se i riferimenti sono null, segna errore
        return;
    }
    setLoading(true);
    setErrorLoading(false);
    
    const fetchAdminData = async () => {
        try {
            // CORRETTO: Uso i riferimenti al Documento
            const [holidaysSnap, settingsSnap] = await Promise.all([
                getDoc(HOLIDAYS_DOC_REF),
                getDoc(SETTINGS_DOC_REF)
            ]);

            if (holidaysSnap.exists()) setBlockedDates(holidaysSnap.data().dates || []);
            // Usiamo merge:true nel setDoc, quindi se non esiste il doc, usiamo INITIAL_SETTINGS
            if (settingsSnap.exists()) setSettings(settingsSnap.data()); 
        } catch (e) {
            console.error("Errore caricamento dati Admin (probabilmente permessi/percorso):", e);
            setErrorLoading(true); // Segna errore in caso di fallimento della lettura
            // Continua con i dati di default (INITIAL_SETTINGS) e blockedDates vuoti.
        }
        setLoading(false);
    };
    fetchAdminData();
  }, [db]);

  const toggleDate = async (dateStr) => {
    if (!HOLIDAYS_DOC_REF) { alert("Errore di connessione o configurazione del database."); return; }
    let newDates = [];
    if (blockedDates.includes(dateStr)) {
      newDates = blockedDates.filter(d => d !== dateStr);
    } else {
      newDates = [...blockedDates, dateStr];
    }
    setBlockedDates(newDates);
    try {
        // CORRETTO: Uso il riferimento al Documento
        await setDoc(HOLIDAYS_DOC_REF, { dates: newDates }, { merge: true });
    } catch (e) { 
        console.error("Errore aggiornamento holidays:", e);
        alert("Errore: Impossibile salvare le date. Controlla i permessi.");
    }
  };

  const saveSettings = async () => {
    if (!db || !SETTINGS_DOC_REF) { alert("Errore di connessione o configurazione del database."); return; }
    try {
      // CORRETTO: Uso il riferimento al Documento
      await setDoc(SETTINGS_DOC_REF, settings, { merge: true });
      alert("Impostazioni salvate!");
    } catch (e) { 
        console.error(e); 
        alert("Errore: Impossibile salvare le impostazioni. Controlla i permessi.");
    }
  };

  // Funzione per generare mail credenziali (FIXED: USA GMAIL WEB)
  const sendCreds = (user) => {
      const subject = encodeURIComponent("Credenziali App Pranzo");
      const adminName = colleaguesList.find(c => c.isAdmin)?.name || "l'amministratore";
      // Ho corretto l'apostrofo con '\' (l\'amministratore) per evitare errori di sintassi JS
      const body = encodeURIComponent(`Ciao ${user.name},\n\necco il tuo PIN per accedere all'app dei pasti: ${user.pin}\n\nSe vuoi cambiarlo, contatta l\'amministratore (probabilmente ${adminName}).\n\nSaluti!`);
      const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${user.email}&su=${subject}&body=${body}`;
      window.open(gmailLink, '_blank');
  };

  const upcoming = ALLOWED_DATES_LIST.filter(d => d >= currentDay).slice(0, 10);
  
  if (loading) return <div className="p-6"><LoadingSpinner text="Caricamento Pannello Admin..." /></div>;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col relative overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
           <h2 className="text-xl font-bold text-gray-800">⚙️ Pannello Amministrazione</h2>
           <button onClick={onClose} className="text-gray-500 hover:text-red-600 font-bold text-xl">&times;</button>
        </div>
        
        <div className="flex border-b overflow-x-auto">
          <button onClick={() => setActiveTab('calendar')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'calendar' ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}>📅 CALENDARIO</button>
          <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'users' ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}>👥 UTENTI</button>
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-3 font-bold text-sm px-4 whitespace-nowrap ${activeTab === 'settings' ? 'border-b-2 border-gray-500 text-gray-800 bg-gray-100' : 'text-gray-500 hover:bg-gray-50'}`}>⚙️ IMPOSTAZIONI</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
            {errorLoading && (
                 <div className="bg-red-100 p-3 mb-4 rounded border border-red-400 text-red-800 text-sm font-bold">
                     ⚠️ Errore di lettura dei dati di configurazione dal database. Le modifiche potrebbero non essere salvate. Controlla i permessi di Firebase (Firestore Security Rules).
                 </div>
            )}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 flex items-center justify-between">
                    <div>
                        <p className="text-purple-800 font-bold text-sm">Stato Giornata Attuale:</p>
                        <p className={`text-xs font-bold ${isForceOpen ? 'text-green-600' : 'text-red-500'}`}>
                            {isForceOpen ? "🔓 SBLOCCATO (Forzato Aperto)" : "🔴 BLOCCATO (Regole Standard)"}
                        </p>
                    </div>
                    <button 
                        onClick={() => onToggleForceOpen(!isForceOpen)}
                        className={`px-4 py-2 rounded text-xs font-bold transition-all ${isForceOpen ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-100 text-red-600 border border-red-300 hover:bg-red-200'}`}
                    >
                        {isForceOpen ? "Blocca Giornata" : "🔓 Sblocca / Forza Apertura"}
                    </button>
                </div>
                
                <hr className="border-gray-200" />
                
                <div>
                    <p className="text-sm text-gray-500 mb-4">Clicca su una data (Lunedì/Giovedì) per bloccare l'ufficio (Ferie/Festa). Applica a tutti.</p>
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
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded border border-blue-100 text-center">
                    <p className="text-blue-800 font-bold text-sm mb-1">Gestione Utenti</p>
                    <p className="text-xs text-blue-600">
                        La lista utenti e PIN è gestita nel codice. Qui puoi inviare il PIN tramite la tua Gmail.
                    </p>
                </div>
                
                <div className="border rounded overflow-hidden">
                    {colleaguesList.map(user => (
                        <div key={user.id} className="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50">
                            <div>
                                <p className="font-bold text-gray-700">{user.name}</p>
                                <p className="text-xs text-gray-400">{user.email}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">{user.pin}</span>
                                <button 
                                 onClick={() => sendCreds(user)}
                                 className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-bold hover:bg-blue-200 flex items-center gap-1"
                                >
                                    ✉️ Invia PIN
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                 <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                     <p className="text-xs text-yellow-800 font-bold mb-2">Queste impostazioni sono condivise e applicate a tutti gli utenti.</p>
                     <p className="text-xs text-yellow-700">Nota: Gli orari di chiusura (11:59, 12:00) sono hardcoded nel codice dell'app.</p>
                 </div>
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

// --- FUNZIONI UTILITY PER RIEPILOGO AGGREGATO ---

const aggregateOrders = (orders) => {
    const aggregated = {};

    orders.forEach(order => {
        // Chiave unica per raggruppamento (piatto + acqua + bar/asporto)
        const key = `${order.itemName}|${order.waterChoice}|${order.isTakeout ? 'Asporto' : 'Bar'}`;
        
        if (!aggregated[key]) {
            aggregated[key] = {
                itemName: order.itemName,
                waterChoice: order.waterChoice,
                isTakeout: order.isTakeout,
                count: 0
            };
        }
        aggregated[key].count++;
    });

    // Converte l'oggetto in un array e lo ordina per quantità (dal più ordinato al meno)
    return Object.values(aggregated).sort((a, b) => b.count - a.count);
};

// --- COMPONENTE RIEPILOGO AGGREGATO (Per Admin) ---
const AggregatedSummary = ({ orders }) => {
    const aggregatedList = useMemo(() => aggregateOrders(orders), [orders]);

    if (aggregatedList.length === 0) return null;

    return (
        <div className="bg-white p-4 rounded-xl shadow border border-blue-200 mb-6">
            <h3 className="font-bold text-blue-800 border-b pb-2 mb-3 flex justify-between items-center">
                <span>📊 Riepilogo Aggregato (Da Ordinare)</span>
                <span className="text-xs text-gray-500">Totale Piatti: {orders.length}</span>
            </h3>
            <div className="space-y-3">
                {aggregatedList.map((item, index) => (
                    <div key={index} className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2">
                            <span className="font-extrabold text-lg text-blue-900 w-6 text-center">{item.count}x</span>
                            <div>
                                <p className="font-bold text-gray-700 text-sm">{item.itemName}</p>
                                <p className="text-xs text-gray-500">
                                    <span className={`px-1 rounded-sm text-white text-[10px] mr-1 ${item.isTakeout ? 'bg-red-500' : 'bg-orange-500'}`}>
                                        {item.isTakeout ? 'ASPORTO' : 'BAR'}
                                    </span>
                                    Acqua: {item.waterChoice}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPALE ---
const App = () => {
  const [user, setUser] = useState(null); 
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Dati dinamici
  const [appSettings, setAppSettings] = useState(INITIAL_SETTINGS);
  const [dataLoaded, setDataLoaded] = useState(false); 
  const [dailyMenu, setDailyMenu] = useState([]); 
  const [adminOverride, setAdminOverride] = useState(false); // STATO PER FORZARE APERTURA
  const [adminUid, setAdminUid] = useState(null); // UID Firebase dell'Admin

  // Dati Ordini del Giorno
  const [orders, setOrders] = useState([]);
  const [orderStatus, setOrderStatus] = useState('open'); 
  const [orderAuthor, setOrderAuthor] = useState('');
  
  const [actingAsUser, setActingAsUser] = useState(null);

  // Dati dell'Ordine Corrente
  const [dishName, setDishName] = useState('');
  const [selectedWater, setSelectedWater] = useState(''); 
  const [diningChoice, setDiningChoice] = useState('');
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false); 
  const [showAdminPanel, setShowAdminPanel] = useState(false); 
  const [showHistory, setShowHistory] = useState(false); 
  const [showMenuManager, setShowMenuManager] = useState(false); 

  const todayDate = new Date();
  const todayStr = formatDate(todayDate);
  const [blockedDates, setBlockedDates] = useState([]);
  const [isShopOpen, setIsShopOpen] = useState(true);
  const [initTimeout, setInitTimeout] = useState(false);

  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const hour = time.getHours();
  const minute = time.getMinutes();

  // LOGICA ORARIA PRECISA - Se Admin Override è attivo, ignora le restrizioni orarie
  
  // 10:30: Inizio Avviso (attivo da 10:30:00 fino a 11:59:59)
  const isLateWarning = !adminOverride && (
      (hour === 10 && minute >= 30) || 
      (hour >= 11 && hour < 12)
  ); 

  // 11:59: Chiusura Modulo (attivo da 11:59:00 in poi)
  const isBookingClosed = !adminOverride && (
      (hour === 11 && minute >= 59) || 
      (hour >= 12)
  );

  // 12:00: Chiusura Email (attivo da 12:00:00 in poi)
  const isEmailClosed = !adminOverride && (hour >= 12); 

  const forceStart = () => {
    setInitTimeout(true);
  };

  // 1. INIT FIREBASE & LOAD CORE DATA
  useEffect(() => {
    if (!db || !auth || !SETTINGS_DOC_REF || !DAILY_MENU_DOC_REF || !HOLIDAYS_DOC_REF || !ADMIN_UID_DOC_REF) {
        // Se Firebase non è inizializzato (es. variabili d'ambiente mancanti in Vercel), forziamo il timeout
        console.error("Firebase non inizializzato. Impossibile avviare la connessione al database.");
        setInitTimeout(true);
        return;
    }
    
    const timeoutId = setTimeout(() => {
      setInitTimeout(true);
    }, 7000);

    const subscribeToData = () => {
       // CORRETTO: Uso i riferimenti al Documento
       const unsubSettings = onSnapshot(SETTINGS_DOC_REF, (snap) => {
          if (snap.exists()) setAppSettings(snap.data());
       });
       
       const unsubMenu = onSnapshot(DAILY_MENU_DOC_REF, (snap) => {
           if (snap.exists()) setDailyMenu(snap.data().items || []);
       });
       
       // Listener per l'UID dell'Admin (usato per le regole di sicurezza)
       const unsubAdminUid = onSnapshot(ADMIN_UID_DOC_REF, (snap) => {
           if (snap.exists()) setAdminUid(snap.data().adminUid || null);
       });


       return () => { unsubSettings(); unsubMenu(); unsubAdminUid(); };
    };

    const checkDateAccess = async () => {
      // La logica isBaseValid controlla se è un giorno di base (Lunedì o Giovedì)
      const isBaseValid = ALLOWED_DATES_LIST.includes(todayStr);
      
      try {
        // Controllo se il giorno è stato bloccato come Festività/Ferie dall'Admin
        const snap = await getDoc(HOLIDAYS_DOC_REF);
        if (snap.exists()) {
          const blocked = snap.data().dates || [];
          setBlockedDates(blocked);
          
          const isBlockedByAdmin = blocked.includes(todayStr);
          
          // isShopOpen è true se è un giorno base E non è stato bloccato dall'admin.
          setIsShopOpen(isBaseValid && !isBlockedByAdmin);
          
        } else {
            // Se non ci sono blocchi, usa solo la logica base (Lunedì o Giovedì)
            setIsShopOpen(isBaseValid);
        }
      } catch (e) { 
        console.error("Err date check", e);
        // Fallback: se errore DB ma è un giorno base, assumi sia aperto
        setIsShopOpen(isBaseValid); 
      }
      setLoading(false); // Il caricamento è completato dopo questo check
    };

    const initAuth = async () => {
        if (!auth.currentUser) {
            try {
                if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
                else await signInAnonymously(auth);
            } catch (e) {
                console.error("Errore Autenticazione Firebase:", e);
                // Non blocca l'app, ma fallisce l'autenticazione.
            }
        }
    };

    // Sequenza di avvio
    initAuth().then(() => {
      subscribeToData();
      checkDateAccess().finally(() => {
        setDataLoaded(true);
      });
    });

    onAuthStateChanged(auth, (u) => {
      if (u) {
        setIsAuthReady(true);
        clearTimeout(timeoutId);
      }
    });

    return () => clearTimeout(timeoutId);
  }, [db, auth, todayStr]);

  // Forzatura manuale caricamento (per evitare blocchi)
  useEffect(() => {
    if (initTimeout && loading) {
      console.warn("Timeout caricamento: forzo avvio con dati locali e accesso limitato.");
      setAppSettings(INITIAL_SETTINGS);
      setDataLoaded(true);
      setIsAuthReady(true);
      setLoading(false);
    }
  }, [initTimeout, loading]);

  // Restore user session & Save Admin UID
  useEffect(() => {
      if (dataLoaded && isAuthReady && !user && auth.currentUser) {
          const savedUserId = sessionStorage.getItem('mealAppUser');
          const firebaseUid = auth.currentUser.uid;
          
          if (savedUserId) {
            const found = COLLEAGUES_LIST.find(c => c.id === savedUserId);
            if (found) {
                setUser(found);
                setActingAsUser(found); 
                
                // --- NUOVA LOGICA: SALVA UID ADMIN ---
                if (found.isAdmin && found.id === USER_ADMIN_ID && db && ADMIN_UID_DOC_REF) {
                    if (adminUid !== firebaseUid) {
                        // Se l'UID di Firebase dell'Admin non è salvato o è diverso, salvalo.
                        setDoc(ADMIN_UID_DOC_REF, { adminUid: firebaseUid, internalId: found.id }, { merge: true })
                            .then(() => setAdminUid(firebaseUid))
                            .catch(e => console.error("Errore salvataggio Admin UID:", e));
                    }
                }
            }
          }
      }
  }, [dataLoaded, isAuthReady, user, auth.currentUser, db, adminUid]);

  // 2. LISTENER ORDINI
  useEffect(() => {
    if (!db || !isAuthReady || !BASE_ORDERS_COLLECTION) return;
    
    // CORRETTO: doc(CollectionRef, docId)
    const docRef = doc(BASE_ORDERS_COLLECTION, todayStr);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const newOrders = data.orders || [];
        setOrders(newOrders);
        setOrderStatus(data.status || 'open');
        setOrderAuthor(data.confirmedBy || '');
        
        // Sincronizza lo stato dell'ordine dell'utente attivo
        if (actingAsUser) {
          const existingOrder = newOrders.find(o => o.userId === actingAsUser.id);
          if (existingOrder) {
            setDishName(existingOrder.itemName || '');
            setSelectedWater(existingOrder.waterChoice || '');
            setDiningChoice(existingOrder.isTakeout ? 'asporto' : 'bar');
          } else if (actingAsUser.id === user?.id) {
            // Se l'utente principale cancella il suo ordine, pulisci il form
             setDishName('');
             setSelectedWater('');
             setDiningChoice('');
          }
        }
      } else {
        setOrders([]);
        setOrderStatus('open');
        setOrderAuthor('');
        if (actingAsUser?.id === user?.id) {
          setDishName('');
          setSelectedWater('');
          setDiningChoice('');
        }
      }
    }, (err) => {
      console.error("Errore listener ordini:", err);
    });

    return () => unsubscribe();
  }, [db, isAuthReady, todayStr, user, actingAsUser]);

  const handleLogin = (colleague) => {
    setUser(colleague);
    setActingAsUser(colleague);
    sessionStorage.setItem('mealAppUser', colleague.id);
  };

  const handleLogout = () => {
    setUser(null);
    setActingAsUser(null);
    sessionStorage.removeItem('mealAppUser');
    // Non facciamo signOut di Firebase perché usiamo l'autenticazione anonima/custom
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
      if (!window.confirm("Sei sicuro di voler eliminare questo ordine?")) return;
      if (!db || !BASE_ORDERS_COLLECTION) return;
      try {
        // CORRETTO: doc(CollectionRef, docId)
        const orderRef = doc(BASE_ORDERS_COLLECTION, todayStr);
        // Filtra l'ordine da eliminare
        await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== targetUserId) });
      } catch(e) { console.error(e); }
  };

  const placeOrder = async () => {
    if (orderStatus === 'sent' && !user.isAdmin) { window.alert("Ordine già inviato al bar! Non puoi modificare."); return; }
    // CORRETTO: Ora controlla isBookingClosed (che è 11:59)
    if (isBookingClosed && !user.isAdmin && !adminOverride) { window.alert("Troppo tardi! Le prenotazioni si chiudono alle 11:59. Solo l'admin può modificare."); return; }

    const newErrors = {};
    let hasError = false;
    
    // VALIDAZIONE AGGIUNTA QUI
    if (!dishName || dishName.trim() === '') { newErrors.dishName = true; hasError = true; }
    if (!selectedWater) { newErrors.water = true; hasError = true; }
    if (!diningChoice) { newErrors.dining = true; hasError = true; }

    setErrors(newErrors);

    if (hasError) {
      setTimeout(() => window.alert("⚠️ Compila tutti i campi evidenziati in rosso!"), 100);
      return; 
    }
    
    if (!db || !BASE_ORDERS_COLLECTION) return;

    // CORRETTO: doc(CollectionRef, docId)
    const orderRef = doc(BASE_ORDERS_COLLECTION, todayStr);
    const cleanDishName = dishName.charAt(0).toUpperCase() + dishName.slice(1);

    const newOrder = {
      userId: actingAsUser.id,
      userName: actingAsUser.name,
      itemName: cleanDishName,
      waterChoice: selectedWater,
      isTakeout: diningChoice === 'asporto',
      timestamp: Date.now(),
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
    if (orderStatus === 'sent' && !user.isAdmin) { window.alert("Ordine già inviato al bar! Non puoi cancellare."); return; }
    if (!db || !BASE_ORDERS_COLLECTION) return;
    try {
      // CORRETTO: doc(CollectionRef, docId)
      const orderRef = doc(BASE_ORDERS_COLLECTION, todayStr);
      await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== actingAsUser.id) });
      setDishName('');
      setSelectedWater('');
      setDiningChoice('');
      setMessage("Ordine annullato 🗑️");
    } catch (e) { console.error(e); }
  };
  
  const generateMailBody = () => {
      const allOrders = orders;
      if (allOrders.length === 0) return "Nessun ordine presente per oggi.";

      const bar = allOrders.filter(o => !o.isTakeout);
      const takeout = allOrders.filter(o => o.isTakeout);

      let body = `Ordine Pranzo di Gruppo - Data: ${todayDate.toLocaleDateString('it-IT')}\n\n`;

      if (bar.length > 0) {
          body += `--- ☕ ORDINI AL BAR (${bar.length}) ---\n`;
          bar.forEach(o => {
              body += `- ${o.userName}: ${o.itemName} (${o.waterChoice === 'Nessuna' ? 'No acqua' : o.waterChoice})\n`;
          });
          body += '\n';
      }

      if (takeout.length > 0) {
          body += `--- 🥡 ORDINI DA ASPORTO (${takeout.length}) ---\n`;
          takeout.forEach(o => {
              body += `- ${o.userName}: ${o.itemName} (${o.waterChoice === 'Nessuna' ? 'No acqua' : o.waterChoice})\n`;
          });
          body += '\n';
      }
      
      body += `\nTotale Ordini: ${allOrders.length}\n\n`;
      body += `Inviato da: ${user.name}\n`;
      
      // Aggiungi tutti i colleghi in CC (eccetto il mittente e gli admin che non vogliono essere in CC)
      const ccList = COLLEAGUES_LIST
        .filter(c => c.id !== user.id && c.email)
        .map(c => c.email)
        .join(',');

      return { body: encodeURIComponent(body), cc: encodeURIComponent(ccList) };
  };

  const openMailLink = (isGmail) => {
    if (orders.length === 0) {
        window.alert("Non ci sono ordini da inviare!");
        return;
    }
    const { body, cc } = generateMailBody();
    const subject = encodeURIComponent(`Ordine Pranzo - ${todayDate.toLocaleDateString('it-IT')}`);
    
    if (isGmail) {
        // Usa GMAIL WEB per PC/Mobile (più affidabile per CC)
        const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${appSettings.emailBar}&su=${subject}&body=${body}&cc=${cc}`;
        window.open(gmailLink, '_blank');
    } else {
        // Usa mailto: per app predefinite (meno affidabile per CC multipli)
        const mailtoLink = `mailto:${appSettings.emailBar}?subject=${subject}&body=${body}&cc=${cc}`;
        window.open(mailtoLink);
    }
  };
  
  const openGmail = () => openMailLink(true);
  const openDefaultMail = () => openMailLink(false);

  const markAsSent = async () => {
    if (!window.confirm("Sei sicuro di aver inviato l'email al Bar? Questa azione blocca l'ordine e lo sposta nello storico.")) return;
    if (!db || !BASE_ORDERS_COLLECTION) return;
    
    // 1. Spostamento dell'ordine nello storico (duplicato con stato "sent")
    try {
        const orderRef = doc(BASE_ORDERS_COLLECTION, todayStr);
        await setDoc(orderRef, { 
            status: 'sent',
            confirmedBy: user.name,
            sentAt: Date.now(),
            // Salva una copia degli ordini come "storico" all'interno del documento del giorno
            historyOrders: orders 
        }, { merge: true });
        window.alert("Ordine confermato e bloccato. Vai allo Storico per verificarlo!");
    } catch (e) { 
        console.error("Errore update status/salvataggio storico", e); 
        window.alert("ERRORE CRITICO: Non sono riuscito a salvare lo storico. Controlla i permessi di scrittura!");
    }
  };

  const unlockOrder = async () => {
    if (!window.confirm("Vuoi davvero riaprire l'ordine? Gli utenti potranno modificare le loro scelte.")) return;
    if (!db || !BASE_ORDERS_COLLECTION) return;
    try {
      // CORRETTO: doc(CollectionRef, docId)
      const orderRef = doc(BASE_ORDERS_COLLECTION, todayStr);
      await setDoc(orderRef, { status: 'open', confirmedBy: '' }, { merge: true });
    } catch (e) { console.error("Errore sblocco", e); }
  };

  const openLateEmail = () => {
    const subject = encodeURIComponent(`Ordine Tardivo/Personale - ${todayDate.toLocaleDateString('it-IT')}`);
    // Messaggio precompilato semplice per ordine singolo
    const body = encodeURIComponent(`Ciao, sono ${user.name}.\nVorrei ordinare per oggi:\n\n- [SCRIVI QUI IL PIATTO]\n\nGrazie!`);
    
    // URL specifico per GMAIL WEB
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${appSettings.emailBar}&su=${subject}&body=${body}`;
    window.open(gmailLink, '_blank');
  };

  if (loading || !dataLoaded) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner text="Connessione al database..." onForceStart={forceStart} /></div>;

  // --- LOGICA ACCESSO: Login sempre permesso ---
  if (!user) return <LoginScreen onLogin={handleLogin} colleagues={COLLEAGUES_LIST} />;

  const nextOpenDay = getNextOpenDay(todayStr);

  // SE CHIUSO E NON OVERRIDE: isShopOpen determina se il modulo ordini è attivo
  const isClosedView = (!isShopOpen && !adminOverride);

  const barOrders = orders.filter(o => !o.isTakeout);
  const takeoutOrders = orders.filter(o => o.isTakeout);

  return (
    <div className={`min-h-screen font-sans p-2 sm:p-6 pb-20 transition-colors duration-500 bg-gray-100`}>
      
      <div className={`max-w-5xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden relative transition-all duration-300`}>
        
        {/* TOP BAR */}
        {/* CORREZIONE: Forzato a flex-row e overflow-x-auto, alzato leggermente */}
        <div className="absolute top-2 right-2 z-50 flex flex-row flex-nowrap overflow-x-auto justify-end gap-2 pr-2">
          
          {user.isAdmin && (
            <>
              <button onClick={() => setShowAdminPanel(true)} className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-orange-400">
                📅 Gestione
              </button>
            </>
          )}
          
          <button onClick={() => setShowHistory(true)} className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-green-500">
            📜 Storico
          </button>
          
          <button onClick={() => setShowHelp(true)} className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-blue-500 flex items-center gap-1">
            <span>ℹ️</span> Guida
          </button>
          <button onClick={handleLogout} className="flex-shrink-0 bg-white/90 hover:bg-white text-gray-800 text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm border border-gray-200">
            Esci ({user.name.split(' ')[0]})
          </button>
        </div>

        {/* MODALI */}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        {showAdminPanel && <AdminPanel db={db} currentDay={todayStr} onClose={() => setShowAdminPanel(false)} colleaguesList={COLLEAGUES_LIST} onToggleForceOpen={setAdminOverride} isForceOpen={adminOverride} />}
        {showHistory && <AdminHistory db={db} onClose={() => setShowHistory(false)} user={user} />}
        {/* PublicMenuManager RIMOSSO */}

        {/* BANNER */}
        <header 
          className="relative text-white overflow-hidden border-b-4 border-green-800 bg-cover bg-center h-48"
          style={{ 
            backgroundColor: '#15803d',
            backgroundImage: BANNER_IMAGE_URL ? `url(${BANNER_IMAGE_URL})` : 'none' 
          }}
        >
           <div className={`absolute inset-0 ${BANNER_IMAGE_URL ? 'bg-black/60' : 'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-200/10 to-green-900'} flex flex-col justify-center items-start text-left p-6 pt-10`}>
             <h1 className="text-4xl font-extrabold tracking-tight uppercase drop-shadow-lg" style={{fontFamily: 'serif'}}>7 MILA CAFFÈ</h1>
             <div className="flex items-center gap-2 mt-1">
               <span className="bg-white/90 text-green-800 px-2 py-0.5 rounded text-xs font-bold tracking-widest shadow-sm">TEL. {appSettings.phoneBar}</span>
             </div>
             {/* FRASE CENTRATA SOTTO LA LINEA VERDE PER STACCARE */}
             <div className="w-full text-center">
                 <div className="max-w-md italic font-serif text-green-50 text-lg border-t-2 border-green-400 pt-3 mt-4 drop-shadow-md mx-auto">
                   "Anche nel caos del lavoro,<br/>il pranzo resta un momento sacro."
                 </div>
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
                    {adminOverride && <span className="text-green-300 font-bold hidden sm:inline">🔓 OVERRIDE ADMIN ATTIVO </span>}
                    {isLateWarning && !adminOverride && <span className="text-yellow-300 font-bold hidden sm:inline">⚠️ ATTENZIONE </span>}
                    {isBookingClosed && !isEmailClosed && !adminOverride && <span className="text-orange-400 font-bold hidden sm:inline">🛑 ORDINI CHIUSI </span>}
                    {isEmailClosed && !adminOverride && <span className="text-red-400 font-bold hidden sm:inline">🛑 EMAIL CHIUSA </span>}
                    {time.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}
                 </div>
             </div>
             <div className="flex items-center justify-center gap-2 text-xs sm:text-sm">
                 <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${orderStatus !== 'sent' ? 'bg-green-600 font-bold' : 'bg-gray-700 text-gray-400'}`}>
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

        {/* --- ALERT INVIO TARDIVO (10:30 - 11:59:59) --- */}
        {isLateWarning && !isBookingClosed && orderStatus !== 'sent' && (
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
        {isEmailClosed && orderStatus !== 'sent' && (
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
                        value={actingAsUser?.id || user.id}
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
                        <p className="text-sm">Il servizio ordini è chiuso oggi. Torna il prossimo giorno utile!</p>
                        <p className="text-xs mt-2">Prossima data: {nextOpenDay}</p>
                    </div>
                ) : (
                    <>
                      <h3 className={`font-bold mb-3 text-sm uppercase tracking-wide border-b pb-1 ${errors.dishName ? 'text-red-600 border-red-200' : 'text-gray-700'}`}>1. Cosa mangi oggi?</h3>
                      
                      {/* MENU RAPIDO - ORA CON SCROLL ORIZZONTALE */}
                      {dailyMenu.length > 0 && (
                          <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1 font-bold flex justify-between">
                                  <span>Menu del Giorno ({dailyMenu.length} piatti):</span>
                                  <span className="text-purple-600">Scorri ➡</span>
                              </p>
                              <div className="flex gap-2 overflow-x-auto pb-2 border p-2 rounded bg-gray-50 snap-x">
                                  {dailyMenu.map((dish, i) => (
                                      <button 
                                          key={i}
                                          onClick={() => { setDishName(dish); if(errors.dishName) setErrors({...errors, dishName: false}); }}
                                          className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap snap-start shadow-sm"
                                      >
                                          {dish}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      <input 
                          value={dishName}
                          onChange={(e) => {
                          setDishName(e.target.value);
                          if(errors.dishName) setErrors(prev => ({...prev, dishName: false}));
                          }}
                          disabled={orderStatus === 'sent' || isBookingClosed}
                          placeholder={(orderStatus === 'sent' || isBookingClosed) ? "Ordine chiuso" : "Es: Insalatona pollo e noci..."}
                          className={`w-full border-2 p-3 rounded-lg text-lg font-bold text-gray-800 outline-none transition-all placeholder:font-normal placeholder:text-gray-300 ${errors.dishName ? 'border-red-400 bg-red-50' : 'border-green-100 focus:border-green-500'} ${(orderStatus === 'sent' || isBookingClosed) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                      />
                    </>
                )}
            </div>

            {/* SEZIONE 2 & 3 - NASCOSTA SE CHIUSO */}
            {!isClosedView && (
                <div className={`bg-white border-2 border-slate-200 p-5 rounded-xl shadow-lg sticky bottom-4 z-20 ${orderStatus === 'sent' || isBookingClosed ? 'opacity-75 grayscale pointer-events-none' : ''}`}>
                    <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide border-b pb-1">2. Completa il tuo ordine</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className={`block text-xs font-bold uppercase mb-2 ${errors.water ? 'text-red-600' : 'text-gray-500'}`}>Scelta Acqua *</label>
                        <div className="flex gap-2 h-20">
                            {['Nessuna', 'Naturale', 'Frizzante'].map(opt => (
                            <div key={opt} className={`flex-1`} onClick={() => {
                                setSelectedWater(opt);
                                if(errors.water) setErrors(prev => ({...prev, water: false}));
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
                    ) : isBookingClosed && !user.isAdmin ? (
                        <div className="bg-red-100 p-3 rounded-lg text-center border border-red-300">
                            <span className="text-red-800 font-bold text-lg">🛑 Ordini Chiusi</span>
                            <p className="text-red-700 text-xs">Le prenotazioni si chiudono alle 11:59.</p>
                        </div>
                    ) : orders.some(o => o.userId === actingAsUser?.id) ? (
                        <div className="flex items-center justify-between bg-green-50 p-2 rounded border border-green-200">
                            <div>
                                <span className="text-green-800 font-bold text-sm block">Ordine Salvato!</span>
                                <span className="text-green-600 text-xs truncate max-w-[150px] inline-block">{dishName}</span>
                                {user.isAdmin && actingAsUser?.id !== user.id && <span className="text-[10px] text-orange-600 block">(per {actingAsUser.name})</span>}
                            </div>
                            <button onClick={cancelOrder} className="text-xs text-red-600 underline hover:text-red-800 font-bold px-2 py-1 rounded hover:bg-red-50">Cancella</button>
                        </div>
                        ) : (
                        <button 
                            onClick={placeOrder} 
                            disabled={!actingAsUser || !dishName || !selectedWater || !diningChoice}
                            className={`w-full text-white py-3 rounded-lg font-bold shadow-lg transform transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${user.isAdmin && actingAsUser?.id !== user.id ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'}`}
                        >
                            <span>{user.isAdmin && actingAsUser?.id !== user.id ? `📨 Ordina per ${actingAsUser.name.split(' ')[0]}` : '📨 Salva la tua scelta'}</span>
                        </button>
                        )}
                        {message && orderStatus !== 'sent' && !isBookingClosed && <p className={`text-center font-bold mt-2 text-sm animate-pulse ${message.includes('Errore') || message.includes('evidenziati') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
                    </div>
                </div>
            )}
            </div>

            {/* RIGHT: Riepilogo e Admin */}
            <div className="lg:col-span-4 space-y-6">
            
            {/* Riepilogo Aggregato - NUOVO */}
            <AggregatedSummary orders={orders} />

            {/* Box Admin / Invio */}
            <div className="bg-slate-100 p-4 rounded-lg border border-slate-300 shadow-sm">
              <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase flex items-center gap-2">
                <span>🚀</span> Zona Invio
              </h3>
              
              {/* SE CHIUSO/SCADUTO MA NON INVIATO: MOSTRA BOTTONI EMERGENZA */}
              {isClosedView ? (
                  <div className="space-y-3">
                      <div className="bg-red-50 border border-red-200 p-3 rounded text-center">
                          <p className="text-red-700 font-bold text-sm mb-1">⛔ SERVIZIO ORDINI CHIUSO</p>
                          <p className="text-xs text-gray-600">L'app riapre il prossimo giorno utile: {nextOpenDay}</p>
                      </div>
                      <a href={`tel:${appSettings.phoneBar}`} className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded text-center shadow-md transition-colors">
                          📞 CHIAMA IL BAR
                      </a>
                  </div>
              ) : (isEmailClosed && orderStatus !== 'sent') ? (
                  <div className="space-y-3">
                      <div className="bg-red-50 border border-red-200 p-3 rounded text-center">
                          <p className="text-red-700 font-bold text-sm mb-1">⛔ TEMPO SCADUTO / CHIUSO</p>
                          <p className="text-xs text-gray-600">Non è possibile inviare l'ordine di gruppo.</p>
                      </div>
                      
                      <a href={`tel:${appSettings.phoneBar}`} className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded text-center shadow-md transition-colors">
                          📞 CHIAMA IL BAR
                      </a>
                      
                      <button onClick={openLateEmail} className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded text-center shadow-md transition-colors">
                          ✉️ MAIL DIRETTA (Personale)
                      </button>
                      <p className="text-[10px] text-gray-500 text-center mt-1">Apre la tua mail solo verso il bar (no colleghi in copia).</p>

                      {/* ADMIN OVERRIDE */}
                      {user.isAdmin && (
                          <div className="pt-4 mt-4 border-t border-gray-300">
                              <p className="text-xs font-bold text-orange-600 mb-2 text-center">🛠️ Admin Override</p>
                               <button onClick={markAsSent} className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded text-xs mb-2">
                                   Forza stato "INVIATO"
                               </button>
                          </div>
                      )}
                  </div>
              ) : orderStatus === 'sent' ? (
                  <div className="text-center p-4 bg-white rounded border border-green-200">
                      <div className="text-4xl mb-2">✅</div>
                      <p className="text-green-800 font-bold">Ordine Inviato da {orderAuthor || 'un collega'}</p>
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
                      <div className="relative border-l-2 border-blue-400 pl-4 ml-2">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div>
                          <h4 className="text-sm font-bold text-blue-800 mb-1">Fase 1: Invia l'Email</h4>
                          <p className="text-xs text-slate-500 mb-2">**QUESTO È CRITICO:** Apri il tuo programma di posta. Il testo è già pronto.</p>
                          <div className="grid gap-2">
                              <button onClick={openGmail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-red-200 text-red-700 hover:bg-red-50">
                                  <span className="text-lg">🔴</span> Gmail Web (PC)
                              </button>
                              <button onClick={openDefaultMail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-slate-300 text-slate-700 hover:bg-slate-50">
                                  <span className="text-lg">📱</span> App Email (Mobile)
                              </button>
                          </div>
                      </div>

                      {/* FASE 2: CONFERMA */}
                      <div className="relative border-l-2 border-green-400 pl-4 ml-2">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div>
                          <h4 className="text-sm font-bold text-green-800 mb-1">Fase 2: Conferma e Blocco</h4>
                          <p className="text-xs text-slate-500 mb-2 font-bold text-green-600">Clicca qui **solo dopo** che l'email è stata spedita dal tuo programma di posta.</p>
                          <button onClick={markAsSent} disabled={orders.length === 0} className="w-full py-3 rounded font-bold shadow flex items-center justify-center gap-2 text-sm bg-green-600 hover:bg-green-700 text-white animate-pulse disabled:opacity-50">
                              <span>✅</span> CONFERMA INVIO E BLOCCA
                          </button>
                      </div>
                  </div>
                )}
            </div>

            <div className="bg-white p-4 rounded-xl shadow border h-full max-h-[600px] overflow-y-auto">
              <h3 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center">
                <span>👀 Riepilogo Ordini Individuale</span>
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
