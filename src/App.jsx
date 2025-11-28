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
const ORDERS_COLLECTION = `${PUBLIC_DATA_PATH}/mealOrders`;
const CONFIG_DOC = `${PUBLIC_DATA_PATH}/config/holidays`; // Documento specifico per le ferie
const MENU_DOC = `${PUBLIC_DATA_PATH}/config/dailyMenu`; // Documento specifico per il menu
const SETTINGS_DOC = `${PUBLIC_DATA_PATH}/settings/main`; // Documento specifico per i settings

const BANNER_IMG = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop"; 

// --- 👥 LISTA COLLEGHI (Modifica qui i nomi/PIN) ---
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

// --- UTILITÀ ---
const formatDate = (date) => date.toISOString().split('T')[0];

const getNextOpenDay = () => {
    const d = new Date();
    for(let i=0; i<7; i++) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() === 1 || d.getDay() === 4) return d;
    }
    return d;
};

// ==========================================
// 2. COMPONENTI UI
// ==========================================

const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center p-8 h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-green-700 mb-4"></div>
    <span className="text-gray-500 font-medium">Caricamento...</span>
  </div>
);

const ClosedScreen = ({ user }) => {
  const nextDate = getNextOpenDay();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  const formattedNext = nextDate.toLocaleDateString('it-IT', options);

  return (
    <div className="bg-white p-8 rounded-xl shadow-lg text-center border-t-4 border-gray-400 m-4">
        <div className="text-6xl mb-4">😴</div>
        <h1 className="text-2xl font-bold text-gray-700 mb-2">Ordini Chiusi</h1>
        <p className="text-gray-500 text-sm mb-4">
           Si prenota solo il <strong>Lunedì</strong> e <strong>Giovedì</strong> entro le 12:00.
        </p>
        <div className="bg-gray-100 p-2 rounded text-xs text-gray-500">
          Prossima Apertura: <span className="text-green-600 font-bold capitalize">{formattedNext}</span>
        </div>
        {user && (
            <p className="mt-6 text-xs text-gray-400">
                Ciao <strong>{user.name}</strong>, puoi comunque consultare lo Storico qui sotto.
            </p>
        )}
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

// --- LOGIN SCREEN ---
const LoginScreen = ({ onLogin }) => {
  const [selId, setSelId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const doLogin = () => {
      const u = COLLEAGUES_LIST.find(c => c.id === selId);
      if (u && u.pin === pin) onLogin(u);
      else setError('PIN errato.');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-8 border-green-700">
        <div className="mb-6">
            <span className="text-5xl">☕</span>
            <h1 className="text-2xl font-bold text-green-800 mt-2 font-serif">7 MILA CAFFÈ</h1>
            <p className="text-xs uppercase tracking-widest text-gray-400">Area Riservata</p>
        </div>
        <div className="space-y-4 text-left">
           <div>
               <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome</label>
               <select className="w-full p-3 border rounded-lg bg-white" value={selId} onChange={e => {setSelId(e.target.value); setError('')}}>
                   <option value="">-- Seleziona --</option>
                   {COLLEAGUES_LIST.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
               </select>
           </div>
           <div>
               <label className="text-xs font-bold text-gray-500 uppercase ml-1">PIN</label>
               <input type="password" className="w-full p-3 border rounded-lg text-center text-xl tracking-widest" maxLength={4} value={pin} onChange={e => {setPin(e.target.value); setError('')}} placeholder="••••" />
           </div>
           {error && <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded text-center">{error}</div>}
           <button onClick={doLogin} className="w-full bg-green-700 text-white py-3 rounded-lg font-bold shadow-lg active:scale-95 transition-transform">ENTRA</button>
        </div>
      </div>
    </div>
  );
};

// --- STORICO ---
const HistoryModal = ({ db, onClose, user }) => {
    const [date, setDate] = useState(formatDate(new Date()));
    const [list, setList] = useState([]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, ORDERS_COLLECTION, date), (s) => {
            if(s.exists()) setList(s.data().orders || []);
            else setList([]);
        });
        return () => unsub();
    }, [db, date]);

    const delDay = async () => {
        if(confirm("Cancellare questa giornata?")) await deleteDoc(doc(db, ORDERS_COLLECTION, date));
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl p-6 w-full max-w-xl h-[80vh] flex flex-col relative shadow-2xl">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 text-2xl hover:text-gray-600">&times;</button>
                <h3 className="font-bold text-xl text-gray-800 mb-4">📜 Storico Ordini</h3>
                <input type="date" className="border p-2 rounded mb-4 font-bold text-gray-700 w-full" value={date} onChange={e => setDate(e.target.value)} />
                
                <div className="flex-1 overflow-y-auto border rounded p-2 bg-gray-50">
                    {list.length === 0 ? <p className="text-center text-gray-400 py-10 italic">Nessun ordine in questa data.</p> : (
                        <div className="space-y-2">
                            {list.map((o, i) => (
                                <div key={i} className="bg-white p-3 rounded border flex justify-between items-center shadow-sm">
                                    <div><span className="font-bold block">{o.userName}</span> <span className="text-sm text-gray-600">{o.itemName}</span></div>
                                    <span className={`text-[10px] px-2 py-1 rounded font-bold ${o.isTakeout?'bg-red-100 text-red-700':'bg-orange-100 text-orange-700'}`}>{o.isTakeout?'ASPORTO':'BAR'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {user.isAdmin && list.length > 0 && (
                    <div className="mt-4 pt-4 border-t text-right">
                        <button onClick={delDay} className="text-red-600 text-xs font-bold hover:underline">🗑️ Elimina Giornata (Admin)</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- ADMIN PANEL ---
const AdminPanel = ({ db, onClose, onToggleForceOpen, isForceOpen }) => {
    const [tab, setTab] = useState('general');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    useEffect(() => {
        getDoc(doc(db, SETTINGS_DOC)).then(s => {
            if(s.exists()) {
                setEmail(s.data().emailBar);
                setPhone(s.data().phoneBar);
            }
        });
    }, [db]);

    const saveSettings = async () => {
        await setDoc(doc(db, SETTINGS_DOC), { emailBar: email, phoneBar: phone }, { merge: true });
        alert("Impostazioni salvate!");
    };

    const sendPin = (u) => {
        const sub = encodeURIComponent("PIN App Mensa");
        const body = encodeURIComponent(`Ciao ${u.name},\n\nil tuo PIN è: ${u.pin}\n\nSaluti.`);
        // Usa il link specifico per Gmail
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${u.email}&su=${sub}&body=${body}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg relative shadow-2xl">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 text-2xl hover:text-gray-600">&times;</button>
                <h3 className="font-bold text-xl text-orange-600 mb-6">⚙️ Gestione</h3>
                
                <div className="space-y-6">
                    {/* Tasto Sblocco */}
                    <div className={`p-4 rounded-lg border text-center ${isForceOpen ? 'bg-green-100 border-green-500' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-sm font-bold mb-2">{isForceOpen ? "🔓 SBLOCCATO PER TUTTI" : "🔴 SEGUI ORARI STANDARD"}</p>
                        <button onClick={() => onToggleForceOpen(!isForceOpen)} className={`px-4 py-2 rounded font-bold text-xs shadow ${isForceOpen ? 'bg-white text-green-700' : 'bg-green-600 text-white'}`}>
                            {isForceOpen ? "RIPRISTINA BLOCCO" : "🔓 FORZA APERTURA ORA"}
                        </button>
                    </div>

                    {/* Sezione Utenti */}
                    <div className="bg-blue-50 p-4 rounded border border-blue-100">
                        <h4 className="font-bold text-blue-800 mb-2 text-sm">📧 Invia PIN ai colleghi</h4>
                        <div className="h-32 overflow-y-auto border bg-white rounded">
                            {COLLEAGUES_LIST.map(u => (
                                <div key={u.id} className="flex justify-between items-center p-2 border-b text-sm">
                                    <span>{u.name}</span>
                                    <button onClick={() => sendPin(u)} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">Invia</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Sezione Settings */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Email Bar</label>
                        <input className="w-full border p-2 rounded mb-3" value={email} onChange={e => setEmail(e.target.value)} />
                        <label className="block text-xs font-bold text-gray-500 mb-1">Telefono Bar</label>
                        <input className="w-full border p-2 rounded mb-4" value={phone} onChange={e => setPhone(e.target.value)} />
                        <button onClick={saveSettings} className="w-full bg-green-600 text-white py-2 rounded font-bold shadow">Salva Modifiche</button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// ==========================================
// 4. APP PRINCIPALE
// ==========================================

const App = () => {
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Dati
    const [isForceOpen, setIsForceOpen] = useState(false);
    const [settings, setSettings] = useState({ emailBar: '', phoneBar: '' });
    const [orders, setOrders] = useState([]);
    const [orderStatus, setOrderStatus] = useState('open');
    
    // UI
    const [showAdmin, setShowAdmin] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    
    // Form
    const [dish, setDish] = useState('');
    const [water, setWater] = useState('');
    const [type, setType] = useState('');
    
    const todayStr = formatDate(new Date());
    const dayOfWeek = new Date().getDay(); // 1=Lun, 4=Gio
    const currentHour = new Date().getHours();

    // Init Firebase
    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) return;
        const start = async () => {
            try {
                const app = initializeApp(firebaseConfig);
                const auth = getAuth(app);
                
                // Auth Flow Corretto: Token -> Anonimo
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken).catch(() => signInAnonymously(auth));
                } else {
                    await signInAnonymously(auth);
                }

                const _db = getFirestore(app);
                setDb(_db);

                // Listeners
                onSnapshot(doc(_db, CONFIG_DOC), (s) => {
                   if(s.exists()) setIsForceOpen(s.data().forceOpen || false);
                });
                
                onSnapshot(doc(_db, SETTINGS_DOC), (s) => {
                    if(s.exists()) setSettings(s.data());
                });
                
                onSnapshot(doc(_db, ORDERS_COLLECTION, todayStr), (s) => {
                    if(s.exists()) {
                        setOrders(s.data().orders || []);
                        setOrderStatus(s.data().status || 'open');
                    } else {
                        setOrders([]);
                        setOrderStatus('open');
                    }
                });

                // Session Restore
                const savedId = sessionStorage.getItem('mealUser');
                if(savedId) {
                    const u = COLLEAGUES_LIST.find(c => c.id === savedId);
                    if(u) setUser(u);
                }
                setLoading(false);
            } catch(e) {
                console.error(e);
                setLoading(false);
            }
        };
        start();
    }, []);

    const handleToggleForceOpen = async (val) => {
        if(db) await setDoc(doc(db, CONFIG_DOC), { forceOpen: val }, { merge: true });
    };

    // Logica Login
    const handleLogin = (u) => {
        setUser(u);
        sessionStorage.setItem('mealUser', u.id);
    };
    const handleLogout = () => {
        setUser(null);
        sessionStorage.removeItem('mealUser');
    };

    // Logica Ordine
    const saveOrder = async () => {
        if(!dish || !water || !type) return alert("Compila tutto!");
        const newOrder = { userId: user.id, userName: user.name, itemName: dish, waterChoice: water, isTakeout: type === 'asporto', timestamp: Date.now() };
        const other = orders.filter(o => o.userId !== user.id);
        try {
            await setDoc(doc(db, ORDERS_COLLECTION, todayStr), { mealDate: todayStr, orders: [...other, newOrder], status: orderStatus }, { merge: true });
            alert("Salvato!");
        } catch(e) { alert("Errore salvataggio: " + e.message); }
    };

    const deleteMyOrder = async () => {
        if(!confirm("Cancellare?")) return;
        const other = orders.filter(o => o.userId !== user.id);
        await updateDoc(doc(db, ORDERS_COLLECTION, todayStr), { orders: other });
        setDish(''); setWater(''); setType('');
    };

    const adminDeleteOrder = async (uid) => {
        if(!confirm("Eliminare questo ordine?")) return;
        const other = orders.filter(o => o.userId !== uid);
        await updateDoc(doc(db, ORDERS_COLLECTION, todayStr), { orders: other });
    };

    const markSent = async () => {
        if(!confirm("Confermi invio? L'ordine sarà bloccato.")) return;
        await setDoc(doc(db, ORDERS_COLLECTION, todayStr), { status: 'sent' }, { merge: true });
        alert("Stato: INVIATO");
    };

    const unlockDay = async () => {
        if(!confirm("Riaprire gli ordini?")) return;
        await setDoc(doc(db, ORDERS_COLLECTION, todayStr), { status: 'open' }, { merge: true });
        alert("Stato: APERTO");
    };

    // Load existing order into form
    useEffect(() => {
        if(user && orders.length) {
            const my = orders.find(o => o.userId === user.id);
            if(my) { setDish(my.itemName); setWater(my.waterChoice); setType(my.isTakeout?'asporto':'bar'); }
        }
    }, [user, orders]);

    // Logica Apertura
    const isDayOk = (dayOfWeek === 1 || dayOfWeek === 4); // Lun o Gio
    const isTimeOk = currentHour < 12;
    const isOpen = isForceOpen || (isDayOk && isTimeOk && orderStatus !== 'sent');
    const isClosedView = !isOpen; // Se falso, mostra ClosedScreen o banner chiuso

    if(loading) return <LoadingSpinner />;
    if(!user) return <LoginScreen onLogin={handleLogin} />;

    return (
        <div className="min-h-screen bg-gray-100 pb-20 font-sans text-gray-800">
            {/* HEADER */}
            <div className="bg-green-700 text-white p-4 sticky top-0 z-50 shadow flex justify-between items-center">
                <div>
                    <h1 className="font-bold text-lg font-serif">7 MILA CAFFÈ</h1>
                    <span className="text-xs opacity-80">Ciao {user.name.split(' ')[0]}</span>
                </div>
                <div className="flex gap-2">
                    {user.isAdmin && <button onClick={() => setShowAdmin(true)} className="bg-orange-500 px-2 py-1 rounded text-xs font-bold shadow">⚙️ Admin</button>}
                    <button onClick={() => setShowHistory(true)} className="bg-blue-600 px-2 py-1 rounded text-xs font-bold shadow">Storico</button>
                    <button onClick={() => setShowHelp(true)} className="bg-white text-green-800 px-2 py-1 rounded text-xs font-bold shadow">?</button>
                    <button onClick={handleLogout} className="border border-white px-2 py-1 rounded text-xs font-bold">Esci</button>
                </div>
            </div>

            {/* MODALI */}
            {showHistory && <HistoryModal db={db} onClose={() => setShowHistory(false)} user={user} />}
            {showAdmin && <AdminPanel db={db} onClose={() => setShowAdmin(false)} isForceOpen={isForceOpen} onToggleForceOpen={handleToggleForceOpen} settings={settings} onSaveSettings={saveSettings} />}
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

            {/* MAIN */}
            <div className="max-w-xl mx-auto p-4 space-y-4">
                
                {/* STATUS HEADER */}
                {!isOpen && (
                    <div className="bg-red-100 text-red-800 p-3 rounded border border-red-300 text-center font-bold text-sm shadow-sm">
                        {isForceOpen ? "🔓 APERTURA FORZATA" : "🛑 ORDINI CHIUSI"}
                        <p className="text-xs font-normal mt-1">
                            {!isDayOk && !isForceOpen ? "Oggi non è giorno di ordini." : (orderStatus === 'sent' ? "Ordine già inviato." : "Orario scaduto.")}
                        </p>
                    </div>
                )}
                {isForceOpen && <div className="bg-yellow-100 text-yellow-800 p-2 rounded text-center text-xs font-bold border border-yellow-300">🔓 APERTURA FORZATA ATTIVA</div>}

                {/* FORM O CHIUSO */}
                {isClosedView && !isForceOpen ? (
                    <ClosedScreen user={user} />
                ) : (
                    <div className="bg-white p-5 rounded-xl shadow-lg border-t-4 border-green-600">
                        <h3 className="font-bold text-gray-700 mb-4 uppercase text-sm">Il tuo vassoio</h3>
                        <input 
                            className="w-full border-2 p-3 rounded-lg text-lg font-bold mb-4 focus:border-green-500 outline-none"
                            placeholder="Cosa mangi oggi?"
                            value={dish} onChange={e => setDish(e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Acqua</p>
                                <div className="flex gap-1 h-16">
                                    {['Naturale','Frizzante','Nessuna'].map(w => <div key={w} className="flex-1"><WaterIcon type={w} selected={water===w} onClick={() => setWater(w)} /></div>)}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase mb-1">Dove</p>
                                <div className="flex gap-1 h-16">
                                    {['bar','asporto'].map(t => <div key={t} className="flex-1"><TypeBtn type={t} active={type===t} onClick={() => setType(t)} /></div>)}
                                </div>
                            </div>
                        </div>

                        {orders.find(o => o.userId === user.id) ? (
                            <div className="flex gap-2">
                                <div className="flex-1 bg-green-100 text-green-800 p-3 rounded text-center font-bold border border-green-200">✅ Ordine Salvato</div>
                                <button onClick={deleteMyOrder} className="bg-red-50 text-red-600 px-4 rounded font-bold border border-red-100">X</button>
                            </div>
                        ) : (
                            <button onClick={saveOrder} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg shadow hover:bg-green-700 transition-transform active:scale-95">SALVA ORDINE</button>
                        )}
                    </div>
                )}

                {/* LISTA ORDINI (SEMPRE VISIBILE) */}
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

                    {/* ADMIN FOOTER */}
                    {user.isAdmin && orders.length > 0 && (
                        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2">
                             <button onClick={() => {
                                 const sub = encodeURIComponent(`Ordine ${todayStr}`);
                                 // LINK PER GMAIL WEB
                                 window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${settings.emailBar || ''}&su=${sub}`, '_blank');
                             }} className="bg-blue-600 text-white py-2 rounded font-bold text-xs">📧 Gmail Web</button>
                             
                             {orderStatus !== 'sent' ? (
                                 <button onClick={markSent} className="bg-green-600 text-white py-2 rounded font-bold text-xs">✅ Segna Inviato</button>
                             ) : (
                                 <button onClick={unlockDay} className="bg-gray-200 text-gray-600 py-2 rounded font-bold text-xs">🔓 Riapri</button>
                             )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper components
const TypeBtn = ({ type, active, onClick }) => (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center p-2 rounded border transition-all ${active ? (type==='bar'?'bg-orange-100 border-orange-500 text-orange-700':'bg-red-100 border-red-500 text-red-700') : 'bg-white border-gray-200 text-gray-400'}`}>
        <span className="text-2xl mb-1">{type === 'bar' ? '☕' : '🥡'}</span>
        <span className="text-[10px] font-bold uppercase">{type}</span>
    </button>
);

export default App;
