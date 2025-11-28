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
const SETTINGS_DOC_PATH = `${PUBLIC_DATA_PATH}/settings`;

const BANNER_IMAGE_URL = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop"; 

// --- 👥 LISTA COLLEGHI ---
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

// --- UTILITÀ ---
const formatDate = (date) => date.toISOString().split('T')[0];

const generateDefaultDates = () => {
    const dates = [];
    const start = new Date();
    const end = new Date('2026-12-31');
    let current = new Date(start);
    while (current <= end) {
        const day = current.getDay();
        // 1 = Lunedì, 4 = Giovedì
        if (day === 1 || day === 4) dates.push(formatDate(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
};

const getNextOpenDay = (todayStr, activeDates) => {
    const datesToCheck = activeDates && activeDates.length > 0 ? activeDates : generateDefaultDates();
    const sorted = [...datesToCheck].sort();
    return sorted.find(d => d > todayStr) || null;
};

// ==========================================
// 2. COMPONENTI UI
// ==========================================

const LoadingSpinner = ({ text }) => (
  <div className="flex flex-col items-center justify-center p-8 h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-700 mb-4"></div>
    <span className="text-gray-500 font-medium">{text || 'Caricamento...'}</span>
  </div>
);

const ClosedScreen = ({ nextDate }) => {
  let formattedNext = "Presto";
  if (nextDate) {
      try {
        const d = new Date(nextDate);
        formattedNext = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
      } catch (e) {}
  }
  return (
    <div className="bg-white p-8 rounded-xl shadow-lg text-center border-t-4 border-gray-400 m-4">
        <div className="text-6xl mb-4">😴</div>
        <h1 className="text-2xl font-bold text-gray-700 mb-2">Oggi Riposo</h1>
        <p className="text-gray-500 text-sm mb-4">
           Le prenotazioni sono chiuse per oggi.
        </p>
        <div className="bg-gray-100 p-2 rounded text-xs text-gray-500">
          Prossima Apertura: <span className="text-green-600 font-bold capitalize">{formattedNext}</span>
        </div>
    </div>
  );
};

const WaterIcon = ({ type, selected, onClick }) => {
  let style = 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50';
  if (selected) {
    if (type === 'Frizzante') style = 'bg-blue-100 border-blue-500 text-blue-700 ring-2 ring-blue-200';
    else if (type === 'Naturale') style = 'bg-cyan-50 border-cyan-500 text-cyan-700 ring-2 ring-cyan-200';
    else style = 'bg-gray-200 border-gray-400 text-gray-700';
  }
  return (
    <div onClick={onClick} className={`flex flex-col items-center justify-center p-2 rounded border cursor-pointer h-full transition-all ${style}`}>
      <span className="text-xl mb-1">{type === 'Naturale' ? '💧' : type === 'Frizzante' ? '🫧' : '🚫'}</span>
      <span className="text-[10px] font-bold uppercase">{type}</span>
    </div>
  );
};

const TypeBtn = ({ type, active, onClick }) => (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center p-2 rounded border transition-all ${active ? (type==='bar'?'bg-orange-100 border-orange-500 text-orange-700':'bg-red-100 border-red-500 text-red-700') : 'bg-white border-gray-200 text-gray-400'}`}>
        <span className="text-2xl mb-1">{type === 'bar' ? '☕' : '🥡'}</span>
        <span className="text-[10px] font-bold uppercase">{type}</span>
    </button>
);

const HelpModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 relative" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-4 right-4 text-2xl text-gray-400">&times;</button>
      <h2 className="text-xl font-bold text-green-800 mb-4">ℹ️ Guida</h2>
      <div className="space-y-4 text-sm text-gray-600">
        <p>• Si ordina nei giorni <strong>Verdi</strong> del calendario (Lun/Gio) entro le 12:00.</p>
        <p>• Puoi sempre accedere per vedere lo storico.</p>
        <p>• Scrivi il piatto a mano nella casella di testo.</p>
      </div>
      <button onClick={onClose} className="w-full mt-6 bg-green-600 text-white py-2 rounded font-bold">OK</button>
    </div>
  </div>
);

// --- LOGIN SCREEN ---
const LoginScreen = ({ onLogin, colleagues = [] }) => {
  const [selId, setSelId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (!selectedColleague) { setError('Seleziona il tuo nome.'); return; }
    const user = colleagues.find(c => c.id === selectedColleague);
    if (user && user.pin === pin) onLogin(user);
    else { setError('PIN errato.'); setPin(''); }
  };
  
  const selectedColleague = selId; 

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-8 border-green-700 relative text-center">
        <div className="mb-8">
          <div className="p-3 bg-green-50 rounded-full shadow-sm inline-block mb-2"><span className="text-4xl">☕</span></div>
          <h1 className="text-3xl font-extrabold text-green-800 mb-2 font-serif">7 MILA CAFFÈ</h1>
          <p className="text-gray-500 text-sm uppercase tracking-widest">Area Riservata</p>
        </div>
        <div className="space-y-6 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Chi sei?</label>
            <select 
              value={selectedColleague}
              onChange={(e) => { setSelId(e.target.value); setError(''); }}
              className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-green-500"
            >
              <option value="">-- Seleziona il tuo nome --</option>
              {colleagues.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">PIN Segreto</label>
            <input 
              type="password" maxLength="4" value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              className="w-full p-3 border border-gray-300 rounded-lg text-center text-2xl font-bold tracking-widest focus:ring-2 focus:ring-green-500"
              placeholder="••••"
            />
          </div>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold text-center">{error}</div>}
          <button onClick={handleLogin} className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-3 rounded-lg shadow-lg active:scale-95 transition-transform">ACCEDI</button>
        </div>
      </div>
    </div>
  );
};

// --- STORICO ---
const AdminHistory = ({ db, onClose, user }) => {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [historyOrders, setHistoryOrders] = useState([]);
  
  useEffect(() => {
      const unsub = onSnapshot(doc(db, PUBLIC_ORDERS_COLLECTION, selectedDate), (snap) => {
          if(snap.exists()) setHistoryOrders(snap.data().orders || []);
          else setHistoryOrders([]);
      });
      return () => unsub();
  }, [db, selectedDate]);

  const deleteDay = async () => {
      if (!user.isAdmin || !confirm("Cancellare TUTTI gli ordini di questo giorno?")) return;
      await deleteDoc(doc(db, PUBLIC_ORDERS_COLLECTION, selectedDate));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 relative h-[80vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 text-2xl hover:text-gray-600">&times;</button>
        <h2 className="text-xl font-bold text-gray-800 mb-4">📜 Archivio Storico</h2>
        <div className="flex gap-4 items-center mb-4 bg-gray-50 p-3 rounded border">
          <label className="font-bold text-sm">Data:</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border p-1 rounded" />
        </div>
        <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-gray-50">
           {historyOrders.length === 0 ? <p className="text-gray-500 italic text-center">Nessun ordine.</p> : (
             <div className="space-y-2">
                 {historyOrders.map((o, i) => (
                   <div key={i} className="bg-white p-2 rounded border flex justify-between text-sm items-center">
                      <div><span className="font-bold text-gray-700">{o.userName}</span> <span className="text-gray-600">{o.itemName}</span></div>
                      <span className={`text-[10px] px-2 py-1 rounded font-bold ${o.isTakeout ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"}`}>{o.isTakeout ? "ASPORTO" : "BAR"}</span>
                   </div>
                 ))}
             </div>
           )}
        </div>
        {user.isAdmin && historyOrders.length > 0 && (
            <div className="mt-4 pt-4 border-t flex justify-end">
                <button onClick={deleteDay} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 px-3 py-2 rounded">🗑️ Elimina Giornata</button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- CALENDARIO ADMIN ---
const AdminCalendar = ({ activeDates, onToggleDate }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1, 0).getDate();
    const days = Array.from({length: daysInMonth}, (_, i) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i+1));
    const changeMonth = (v) => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + v); setCurrentMonth(d); };

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-4 bg-gray-100 p-2 rounded-lg">
                <button onClick={() => changeMonth(-1)} className="px-3 font-bold">&lt;</button>
                <h4 className="font-bold capitalize text-gray-700">{currentMonth.toLocaleDateString('it-IT', {month:'long', year:'numeric'})}</h4>
                <button onClick={() => changeMonth(1)} className="px-3 font-bold">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['L','M','M','G','V','S','D'].map(d => <span key={d} className="text-[10px] font-bold text-gray-400">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({length: (days[0].getDay() + 6) % 7}).map((_, i) => <div key={i}></div>)}
                {days.map(d => {
                    const dStr = formatDate(d);
                    const isActive = activeDates.includes(dStr);
                    return (
                        <button key={dStr} onClick={() => onToggleDate(dStr)} className={`p-2 rounded text-xs font-bold transition-all ${isActive ? 'bg-green-500 text-white shadow' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>{d.getDate()}</button>
                    )
                })}
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Verde = Aperto. Grigio = Chiuso. Clicca per cambiare.</p>
        </div>
    );
};

// --- ADMIN PANEL ---
const AdminPanel = ({ db, onClose, activeDates }) => {
  const [tab, setTab] = useState('cal');
  const [settings, setSettings] = useState(INITIAL_SETTINGS);

  useEffect(() => {
      getDoc(doc(db, SETTINGS_DOC_PATH, 'main')).then(snap => { if (snap.exists()) setSettings(snap.data()); });
  }, [db]);

  const handleToggleDate = async (dStr) => {
    const newDates = activeDates.includes(dStr) ? activeDates.filter(d=>d!==dStr) : [...activeDates, dStr];
    await setDoc(doc(db, CONFIG_DOC_PATH, 'holidays'), { activeDates: newDates }, { merge: true });
  };

  const saveSettings = async () => {
    await setDoc(doc(db, SETTINGS_DOC_PATH, 'main'), settings, { merge: true });
    alert("Impostazioni salvate!");
  };

  const sendCreds = (user) => {
      const subject = encodeURIComponent("Credenziali App Pranzo");
      const body = encodeURIComponent(`Ciao ${user.name},\n\necco il tuo PIN per accedere all'app dei pasti: ${user.pin}\n\nSaluti`);
      const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${user.email}&su=${subject}&body=${body}`;
      window.open(gmailLink, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
           <h2 className="text-xl font-bold text-gray-800">⚙️ Amministrazione</h2>
           <button onClick={onClose} className="text-gray-500 text-xl">&times;</button>
        </div>
        <div className="flex border-b">
          <button onClick={() => setTab('cal')} className={`flex-1 py-3 text-sm font-bold ${tab==='cal'?'border-b-2 border-orange-500 text-orange-600':'text-gray-500'}`}>CALENDARIO</button>
          <button onClick={() => setTab('users')} className={`flex-1 py-3 text-sm font-bold ${tab==='users'?'border-b-2 border-blue-500 text-blue-600':'text-gray-500'}`}>UTENTI</button>
          <button onClick={() => setTab('settings')} className={`flex-1 py-3 text-sm font-bold ${tab==='settings'?'border-b-2 border-gray-500 text-gray-800':'text-gray-500'}`}>SETTINGS</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
           {tab === 'cal' && (
             <div className="space-y-4">
                <div className="bg-green-50 p-3 rounded text-center text-xs text-green-800">Clicca su un giorno per aprirlo o chiuderlo.</div>
                <AdminCalendar activeDates={activeDates} onToggleDate={handleToggleDate} />
             </div>
           )}
           {tab === 'users' && (
             <div className="space-y-2">
                 <p className="text-xs text-center bg-blue-50 p-2 rounded text-blue-600">Lista utenti gestita da codice.</p>
                 {COLLEAGUES_LIST.map(u => (
                     <div key={u.id} className="flex justify-between items-center p-2 border-b">
                         <div><span className="font-bold text-sm">{u.name}</span> <span className="text-xs text-gray-400">({u.pin})</span></div>
                         <button onClick={() => sendCreds(u)} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">✉️ PIN Gmail</button>
                     </div>
                 ))}
             </div>
           )}
           {tab === 'settings' && (
             <div className="space-y-4">
                <input className="w-full border p-2 rounded" value={settings.emailBar} onChange={e=>setSettings({...settings, emailBar:e.target.value})} placeholder="Email Bar" />
                <input className="w-full border p-2 rounded" value={settings.phoneBar} onChange={e=>setSettings({...settings, phoneBar:e.target.value})} placeholder="Telefono Bar" />
                <button onClick={saveSettings} className="bg-green-600 text-white w-full py-2 rounded font-bold">Salva</button>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

// --- APP ---
const App = () => {
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [activeDates, setActiveDates] = useState([]);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [orders, setOrders] = useState([]);
  const [orderStatus, setOrderStatus] = useState('open');

  const [dish, setDish] = useState('');
  const [water, setWater] = useState('');
  const [type, setType] = useState('');
  const [message, setMessage] = useState('');

  const [showAdmin, setShowAdmin] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const todayStr = formatDate(new Date());
  const hour = new Date().getHours();

  const isBookingClosed = (hour >= 12);
  
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0) return;
    const timeoutId = setTimeout(() => setLoading(false), 7000);

    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const _db = getFirestore(app);
      setDb(_db);

      if (initialAuthToken && !auth.currentUser) {
           signInWithCustomToken(auth, initialAuthToken).catch(() => signInAnonymously(auth));
      } else if (!auth.currentUser) {
           signInAnonymously(auth);
      }

      onAuthStateChanged(auth, (u) => {
          if (u) {
              const configRef = doc(_db, CONFIG_DOC_PATH, 'holidays');
              onSnapshot(configRef, (snap) => {
                  if(snap.exists()) setActiveDates(snap.data().activeDates || []);
                  else setDoc(configRef, { activeDates: generateDefaultDates() });
              }, (err) => console.log("Config read error"));

              onSnapshot(doc(_db, SETTINGS_DOC_PATH, 'main'), (s) => { if(s.exists()) setSettings(s.data()); }, (err) => {});
              
              onSnapshot(doc(_db, PUBLIC_ORDERS_COLLECTION, todayStr), (s) => {
                 if(s.exists()) {
                     setOrders(s.data().orders || []);
                     setOrderStatus(s.data().status || 'open');
                 } else {
                     setOrders([]); setOrderStatus('open');
                 }
              }, (err) => {});

              const saved = sessionStorage.getItem('mealUser');
              if(saved) {
                  const u = COLLEAGUES_LIST.find(c => c.id === saved);
                  if(u) setUser(u);
              }
              setLoading(false);
              clearTimeout(timeoutId);
          }
      });
    } catch(e) { console.error(e); setLoading(false); }
    return () => clearTimeout(timeoutId);
  }, []);

  const saveOrder = async () => {
      if(!dish || !water || !type) return alert("Compila tutto!");
      const newOrder = { userId: user.id, userName: user.name, itemName: dish, waterChoice: water, isTakeout: type === 'asporto', timestamp: Date.now() };
      const otherOrders = orders.filter(o => o.userId !== user.id);
      try {
          await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { mealDate: todayStr, orders: [...otherOrders, newOrder], status: orderStatus }, { merge: true });
          setMessage("Ordine Salvato!");
          setTimeout(()=>setMessage(''), 2000);
      } catch(e) { alert("Errore salvataggio: " + e.message); }
  };

  const deleteMyOrder = async () => {
      if(!confirm("Cancellare?")) return;
      const other = orders.filter(o => o.userId !== user.id);
      await updateDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { orders: other });
      setDish(''); setWater(''); setType('');
  };

  const adminDeleteOrder = async (uid) => {
      if(!confirm("Eliminare questo ordine?")) return;
      const other = orders.filter(o => o.userId !== uid);
      await updateDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { orders: other });
  };

  const markSent = async () => {
      if(!confirm("Confermi invio?")) return;
      await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { status: 'sent', confirmedBy: user.name }, { merge: true });
  };

  const unlockDay = async () => {
      if(!confirm("Riaprire gli ordini?")) return;
      await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { status: 'open' }, { merge: true });
  };
  
  const openGmail = () => {
      const subject = encodeURIComponent(`Ordine ${todayStr}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${settings.emailBar}&su=${subject}`, '_blank');
  };
  
  const openLateEmail = () => {
      const subject = encodeURIComponent(`Ordine Personale ${todayStr}`);
      const body = encodeURIComponent(`Ciao, sono ${user.name}.\nVorrei ordinare:\n...`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${settings.emailBar}&su=${subject}&body=${body}`, '_blank');
  };

  useEffect(() => {
      if(user && orders.length) {
          const my = orders.find(o => o.userId === user.id);
          if(my) { setDish(my.itemName); setWater(my.waterChoice); setType(my.isTakeout?'asporto':'bar'); }
      }
  }, [user, orders]);

  const isTodayAllowed = activeDates.includes(todayStr);
  const isShopActive = isTodayAllowed && !isBookingClosed && orderStatus !== 'sent';
  const isClosedView = !isShopActive;

  if(loading) return <LoadingSpinner />;
  if(!user) return <LoginScreen onLogin={(u) => { setUser(u); sessionStorage.setItem('mealUser', u.id); }} colleagues={COLLEAGUES_LIST} />;

  return (
    <div className="min-h-screen bg-gray-100 pb-24 font-sans text-gray-800">
        <div className="bg-green-700 text-white p-4 sticky top-0 z-50 shadow flex justify-between items-center">
            <div><h1 className="font-bold text-lg font-serif">7 MILA CAFFÈ</h1><span className="text-xs opacity-80">Ciao {user.name.split(' ')[0]}</span></div>
            <div className="flex gap-2">
                {user.isAdmin && <button onClick={() => setShowAdmin(true)} className="bg-orange-500 px-2 py-1 rounded text-xs font-bold shadow">⚙️ Admin</button>}
                <button onClick={() => setShowHistory(true)} className="bg-blue-600 px-2 py-1 rounded text-xs font-bold shadow">Storico</button>
                <button onClick={() => setShowHelp(true)} className="bg-white text-green-800 px-2 py-1 rounded text-xs font-bold shadow">?</button>
                <button onClick={() => { setUser(null); sessionStorage.removeItem('mealUser'); }} className="border border-white px-2 py-1 rounded text-xs font-bold">Esci</button>
            </div>
        </div>

        {showAdmin && <AdminPanel db={db} onClose={() => setShowAdmin(false)} activeDates={activeDates} />}
        {showHistory && <AdminHistory db={db} onClose={() => setShowHistory(false)} user={user} />}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

        <div className="max-w-2xl mx-auto p-4 space-y-4">
            {!isShopActive && (
                <div className="bg-red-100 text-red-800 p-3 rounded border border-red-300 text-center font-bold text-sm">
                    🛑 ORDINI CHIUSI
                    <p className="text-xs font-normal mt-1">{!isTodayAllowed ? "Oggi non è giorno di ordini." : (orderStatus === 'sent' ? "Ordine già inviato." : "Orario scaduto.")}</p>
                </div>
            )}

            {isClosedView ? (
                <ClosedScreen nextDate={getNextOpenDay(todayStr, activeDates.length > 0 ? activeDates : null)} />
            ) : (
                <div className="bg-white p-5 rounded-xl shadow-lg border-t-4 border-green-600">
                     <h3 className="font-bold text-gray-700 mb-4 uppercase text-sm">Il tuo vassoio</h3>
                     <input className="w-full border-2 p-3 rounded-lg text-lg font-bold" placeholder="Cosa mangi?" value={dish} onChange={e => setDish(e.target.value)} />
                     <div className="grid grid-cols-2 gap-3 mt-4">
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase mb-1">Acqua</p>
                             <div className="flex gap-1 h-14">
                                 {['Naturale', 'Frizzante', 'Nessuna'].map(w => <div key={w} className="flex-1" onClick={() => setWater(w)}><WaterIcon type={w} selected={water===w} /></div>)}
                             </div>
                         </div>
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase mb-1">Dove</p>
                             <div className="flex gap-1 h-14">
                                 <button onClick={() => setType('bar')} className={`flex-1 rounded border flex flex-col items-center justify-center ${type==='bar'?'bg-orange-100 border-orange-500 text-orange-700':'bg-gray-50'}`}><span className="text-xl">☕</span><span className="text-[10px] font-bold">BAR</span></button>
                                 <button onClick={() => setType('asporto')} className={`flex-1 rounded border flex flex-col items-center justify-center ${type==='asporto'?'bg-red-100 border-red-500 text-red-700':'bg-gray-50'}`}><span className="text-xl">🥡</span><span className="text-[10px] font-bold">VIA</span></button>
                             </div>
                         </div>
                     </div>
                     <div className="mt-4 pt-2">
                         {orders.find(o => o.userId === user.id) ? (
                             <div className="flex gap-2">
                                 <div className="flex-1 bg-green-100 text-green-800 p-3 rounded text-center font-bold">✅ Ordine Salvato</div>
                                 <button onClick={deleteMyOrder} className="bg-red-100 text-red-600 px-4 rounded font-bold">X</button>
                             </div>
                         ) : (
                             <button onClick={saveOrder} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg shadow hover:bg-green-700">SALVA ORDINE</button>
                         )}
                         {message && <p className="text-center text-green-600 text-xs mt-2 font-bold">{message}</p>}
                     </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow p-4">
                <div className="flex justify-between items-center border-b pb-2 mb-2">
                    <h3 className="font-bold text-gray-700">Riepilogo ({orders.length})</h3>
                    {orderStatus === 'sent' && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-bold">INVIATO</span>}
                </div>
                {orders.length === 0 ? <p className="text-center text-gray-400 py-6 italic text-sm">Nessun ordine.</p> : (
                    <div className="space-y-2">
                        {orders.map((o, i) => (
                            <div key={i} className="flex justify-between items-center p-2 bg-gray-50 rounded border-l-4 border-gray-300 text-sm">
                                <div><span className="font-bold block text-gray-800">{o.userName}</span> <span className="text-gray-600">{o.itemName}</span></div>
                                <div className="text-right flex items-center gap-2">
                                    <div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold block ${o.isTakeout ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>{o.isTakeout ? 'ASPORTO' : 'BAR'}</span>
                                        <span className="text-xs text-blue-400">{o.waterChoice}</span>
                                    </div>
                                    {user.isAdmin && <button onClick={() => adminDeleteOrder(o.userId)} className="text-red-500 font-bold px-2">X</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 pt-4 border-t">
                    {(isClosedView && orderStatus !== 'sent') ? (
                        <div className="space-y-2">
                            <p className="text-xs text-red-500 font-bold text-center">⚠️ Ritardo? Usa questi:</p>
                            <a href={`tel:${settings.phoneBar}`} className="block w-full bg-green-600 text-white text-center py-2 rounded font-bold text-xs">📞 Chiama Bar</a>
                            <button onClick={openLateEmail} className="block w-full bg-blue-600 text-white text-center py-2 rounded font-bold text-xs">✉️ Mail Personale (Gmail)</button>
                            {user.isAdmin && <button onClick={markAsSent} className="block w-full bg-gray-300 text-gray-700 py-1 rounded text-[10px] font-bold mt-2">Forza 'Inviato'</button>}
                        </div>
                    ) : (
                        user.isAdmin && orders.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={openGmail} className="bg-blue-600 text-white py-2 rounded font-bold text-xs">📧 Gmail Web</button>
                                {orderStatus !== 'sent' ? 
                                    <button onClick={markAsSent} className="bg-green-600 text-white py-2 rounded font-bold text-xs">✅ Segna Inviato</button> :
                                    <button onClick={unlockDay} className="bg-gray-200 text-gray-600 py-2 rounded font-bold text-xs">🔓 Riapri</button>
                                }
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default App;
