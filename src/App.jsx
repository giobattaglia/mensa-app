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
const HOLIDAYS_DOC_PATH = `${CONFIG_DOC_PATH}/holidays`; // Percorso corretto


const BANNER_IMAGE_URL = "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=2074&auto=format&fit=crop";
const LOGIN_BG_URL = "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop"; // Sfondo cibo verde/fresco

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

const getNextOpenDay = (todayStr, activeDates) => {
    const sortedDates = [...activeDates].sort();
    return sortedDates.find(d => d > todayStr) || sortedDates[0] || null;
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
                ℹ️ Guida all'uso
            </h2>

            <div className="space-y-6">
                <div>
                    <h3 className="font-bold text-gray-800 border-b pb-1 mb-2">1. Come Ordinare</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
                        <li>Il sistema apre di default **solo i giorni Lunedì e Giovedì**. L'Admin può aprire altri giorni tramite Calendario.</li>
                        <li>Puoi sempre accedere per vedere lo storico.</li>
                        <li>Scrivi il piatto a mano nella casella di testo.</li>
                    </ul>
                </div>

                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <h3 className="font-bold text-red-800 border-b border-red-300 pb-1 mb-2">2. Scadenze</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-red-700">
                        <li>**10:30:** Chiusura ordini e Allarme Invio.</li>
                        <li>**12:00:** STOP ORDINI. Il sistema si blocca.</li>
                        <li>**13:00:** STOP EMAIL. L'unico tasto disponibile è "CHIAMA IL BAR".</li>
                    </ul>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                    <h3 className="font-bold text-orange-800 border-b border-orange-300 pb-1 mb-2">3. Admin</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-orange-700">
                        <li>L'Admin può usare il calendario per **aprire/chiudere** qualsiasi giorno.</li>
                        <li>L'Admin può **forzare l'apertura** immediata con l'interruttore.</li>
                        <li>L'Admin può **sbloccare** un ordine chiuso per errore (stato 'sent').</li>
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
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-8 h-8 ${selected ? 'text-blue-700' : hasError ? 'text-red-400' : 'text-blue-400'}`}><path d="M7 0h10v2H7z" className="text-blue-900"/><path d="M9 2h6v3H9z" className="text-blue-300"/></svg>
                        <div className="absolute top-1/2 left-1 w-1 h-1 bg-white rounded-full animate-bounce"></div>
                        <div className="absolute bottom-2 left-3 w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                    <span className={`text-xs font-bold mt-1 ${selected ? 'text-blue-800' : hasError ? 'text-red-600' : 'text-gray-500'}`}>FRIZZANTE</span>
                </>
            )}
            {type === 'Nessuna' && (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-8 h-8 ${selected ? 'text-gray-600' : hasError ? 'text-red-400' : 'text-gray-300'}`}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    <span className={`text-xs font-bold mt-1 ${selected ? 'text-gray-800' : hasError ? 'text-red-600' : 'text-gray-400'}`}>NESSUNA</span>
                </>
            )}
        </div>
    );
};

// --- SCHERMATA LOGIN REDESIGNED ---
const LoginScreen = ({ onLogin, colleagues = [] }) => {
    const [selectedColleague, setSelectedColleague] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const safeColleagues = Array.isArray(colleagues) ? colleagues : [];

    const handleLogin = () => {
        if (!selectedColleague) { setError('Seleziona il tuo nome.'); return; }
        const user = safeColleagues.find(c => c.id === selectedColleague);
        if (user && user.pin === pin) onLogin(user);
        else { setError('PIN errato. Riprova.'); setPin(''); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative bg-gray-900">
            {/* SFONDO CON IMMAGINE */}
            <div className="absolute inset-0 bg-cover bg-center z-0" style={{ backgroundImage: `url(${LOGIN_BG_URL})`, opacity: 0.6 }}></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-0"></div>

            <div className="bg-white/95 backdrop-blur-md p-8 rounded-3xl shadow-2xl w-full max-w-md border-t-8 border-green-700 relative z-10 animate-fade-in-up">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <div className="p-4 bg-green-100 rounded-full shadow-inner border border-green-200">
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12 text-green-700">
                                <path d="M12.75 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM7.5 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8.25 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM9.75 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM10.5 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12.75 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM14.25 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM15 17.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM16.5 15.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM15 12.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM16.5 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
                                <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 0 1 7.5 3v1.5h9V3A.75.75 0 0 1 18 3v1.5h.75a3 3 0 0 1 3 3v11.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3H6V3a.75.75 0 0 1 .75-.75Zm13.5 9a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5Z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-4xl font-extrabold text-green-900 mb-2 font-serif tracking-tight">7 MILA CAFFÈ</h1>
                    <p className="text-green-700 font-medium text-xs italic mt-3 border-t border-green-200 pt-3">
                        "Anche nel caos del lavoro,<br />il pranzo resta un momento sacro."
                    </p>
                </div>

                <div className="space-y-5">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <select
                            value={selectedColleague}
                            onChange={(e) => { setSelectedColleague(e.target.value); setError(''); }}
                            className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-gray-50 text-gray-700 transition-all font-medium appearance-none"
                        >
                            <option value="">Seleziona il tuo nome...</option>
                            {safeColleagues.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="password"
                            maxLength="4"
                            value={pin}
                            onChange={(e) => { setPin(e.target.value); setError(''); }}
                            className="w-full pl-10 pr-3 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-gray-50 text-gray-700 transition-all font-bold tracking-widest"
                            placeholder="PIN"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold text-center border border-red-200 flex items-center justify-center gap-2">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        className="w-full bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95 disabled:opacity-50 text-lg tracking-wide"
                        disabled={safeColleagues.length === 0}
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

    const loadHistory = async (dateStr) => {
        setLoadingHistory(true);
        try {
            const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, dateStr);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && docSnap.data().status === 'sent') { // Filtra solo se lo stato è 'sent'
                // Ordine alfabetico per nome
                const rawOrders = docSnap.data().orders || [];
                const sorted = rawOrders.sort((a, b) => a.userName.localeCompare(b.userName));
                setHistoryOrders(sorted);
                setHistoryStatus(docSnap.data().status || 'open');
                setHistoryAuthor(docSnap.data().confirmedBy || '');
            } else {
                setHistoryOrders([]);
                setHistoryStatus('Nessun ordine trovato o non inviato');
                setHistoryAuthor('');
            }
        } catch (e) { console.error(e); }
        setLoadingHistory(false);
    };

    useEffect(() => {
        loadHistory(selectedDate);
    }, [selectedDate, db]);

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
                    <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border p-1 rounded" />
                </div>

                <div className="flex-1 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                    {loadingHistory ? <p>Caricamento...</p> : (
                        historyOrders.length === 0 ? <p className="text-gray-500 italic text-center">Nessun ordine ufficiale inviato in questa data.</p> : (
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
                        <button onClick={deleteDay} className="text-red-600 hover:text-red-800 text-xs font-bold flex items-center gap-1 bg-red-50 px-3 py-2 rounded border border-red-200">
                            🗑️ Elimina Tutta la Giornata (Admin)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- CALENDARIO ADMIN ---
const AdminCalendar = ({ activeDates, onToggleDate, todayStr }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(); // 0=Sunday, 1=Monday...
    const changeMonth = (v) => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + v); setCurrentMonth(d); };
    const startOffset = (firstDay + 6) % 7;
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1));

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-4 bg-gray-100 p-2 rounded-lg">
                <button onClick={() => changeMonth(-1)} className="px-4 py-1 font-bold text-lg bg-white rounded shadow text-gray-600 hover:bg-gray-50">❮</button>
                <h4 className="font-bold capitalize text-gray-700 text-lg">{currentMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h4>
                <button onClick={() => changeMonth(1)} className="px-4 py-1 font-bold text-lg bg-white rounded shadow text-gray-600 hover:bg-gray-50">❯</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => <span key={d} className="text-xs font-bold text-gray-500">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOffset }).map((_, i) => <div key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}-empty-${i}`}></div>)}
                {days.map(d => {
                    const dStr = formatDate(d);
                    const isActive = activeDates.includes(dStr);
                    const isToday = todayStr === dStr;
                    return (
                        <button key={dStr} onClick={() => onToggleDate(dStr)} className={`p-2 rounded text-sm font-bold transition-all border ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${isActive ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                            {d.getDate()}
                        </button>
                    )
                })}
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">Verde = Aperto. Grigio = Chiuso. Clicca per cambiare.</p>
        </div>
    );
};

// --- ADMIN PANEL ---
const AdminPanel = ({ db, onClose, colleaguesList, adminOverride, onToggleForceOpen, todayStr, adminName }) => {
    const [tab, setTab] = useState('cal');
    const [settings, setSettings] = useState(INITIAL_SETTINGS);
    const [activeDates, setActiveDates] = useState(generateAllowedDates());
    const [loadingDates, setLoadingDates] = useState(true);

    useEffect(() => {
        if (!db) return;

        // Load Holiday Dates
        getDoc(doc(db, HOLIDAYS_DOC_PATH)).then(snap => {
            if (snap.exists() && snap.data().activeDates) setActiveDates(snap.data().activeDates);
            else setDoc(doc(db, HOLIDAYS_DOC_PATH), { activeDates: generateAllowedDates() }, { merge: true }).catch(console.error);
        }).catch(console.error).finally(() => setLoadingDates(false));

        // Load Settings
        getDoc(doc(db, SETTINGS_DOC_PATH, 'main')).then(snap => { if (snap.exists()) setSettings(snap.data()); }).catch(console.error);

    }, [db]);

    const handleToggleDate = async (dStr) => {
        const newDates = activeDates.includes(dStr) ? activeDates.filter(d => d !== dStr) : [...activeDates, dStr];
        setActiveDates(newDates);
        await setDoc(doc(db, HOLIDAYS_DOC_PATH), { activeDates: newDates }, { merge: true });
    };

    const saveSettings = async () => {
        try {
            await setDoc(doc(db, SETTINGS_DOC_PATH, 'main'), settings, { merge: true });
            alert("Impostazioni salvate!");
        } catch (e) { console.error(e); alert("Errore impostazioni"); }
    };

    const sendCreds = (user) => {
        const subject = encodeURIComponent("Credenziali App Pranzo");
        const body = encodeURIComponent(`Ciao ${user.name},\n\necco il tuo PIN per accedere all'app dei pasti: ${user.pin}\n\nSe vuoi cambiarlo, contattami.\n\nSaluti,\n${adminName}`);
        const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${user.email}&su=${subject}&body=${body}`;
        window.open(gmailLink, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col relative overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">⚙️ Amministrazione di {adminName}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-600 font-bold text-xl">&times;</button>
                </div>
                <div className="flex border-b overflow-x-auto">
                    <button onClick={() => setTab('cal')} className={`flex-1 py-3 text-sm px-4 whitespace-nowrap font-bold ${tab === 'cal' ? 'border-b-2 border-orange-500 text-orange-600 bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}>📅 CALENDARIO</button>
                    <button onClick={() => setTab('users')} className={`flex-1 py-3 text-sm px-4 whitespace-nowrap font-bold ${tab === 'users' ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}>👥 UTENTI</button>
                    <button onClick={() => setTab('settings')} className={`flex-1 py-3 text-sm px-4 whitespace-nowrap font-bold ${tab === 'settings' ? 'border-b-2 border-gray-500 text-gray-800 bg-gray-100' : 'text-gray-500 hover:bg-gray-50'}`}>⚙️ IMPOSTAZIONI</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {tab === 'cal' && (
                        <div className="space-y-6">
                            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 flex items-center justify-between">
                                <div>
                                    <p className="text-purple-800 font-bold text-sm">Stato Giornata Attuale:</p>
                                    <p className={`text-xs font-bold ${adminOverride ? 'text-green-600' : 'text-red-500'}`}>{adminOverride ? "🔓 SBLOCCATO (Override Attivo)" : "🔴 BLOCCATO (Regole Standard)"}</p>
                                </div>
                                <button
                                    onClick={() => onToggleForceOpen(!adminOverride)}
                                    className={`px-4 py-2 rounded text-xs font-bold transition-all ${adminOverride ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-100 text-red-600 border border-red-300 hover:bg-red-200'}`}
                                >
                                    {adminOverride ? "Blocca Override" : "🔓 Forza Apertura ORA"}
                                </button>
                            </div>
                            <hr className="border-gray-200" />
                            {loadingDates ? <LoadingSpinner text="Caricamento calendario..." /> : (
                                <div className="max-w-xl mx-auto">
                                    <p className="text-sm text-gray-500 mb-4 text-center">Clicca per aprire (Verde) o chiudere (Grigio) un giorno specifico.</p>
                                    <AdminCalendar activeDates={activeDates} onToggleDate={handleToggleDate} todayStr={todayStr} />
                                </div>
                            )}
                        </div>
                    )}
                    {tab === 'users' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded border border-blue-100 text-center">
                                <p className="text-blue-800 font-bold text-sm mb-1">Gestione Utenti</p>
                                <p className="text-xs text-blue-600">La lista utenti e i PIN sono gestiti da codice.</p>
                            </div>
                            <div className="border rounded overflow-hidden">
                                {colleaguesList.map(user => (
                                    <div key={user.id} className="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50">
                                        <div><p className="font-bold text-sm">{user.name} {user.isAdmin && "👑"}</p><p className="text-xs text-gray-400">{user.email}</p></div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">PIN: {user.pin}</span>
                                            <button onClick={() => sendCreds(user)} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded font-bold hover:bg-blue-200">✉️ Invia PIN</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {tab === 'settings' && (
                        <div className="space-y-4">
                            <div className="bg-gray-100 p-4 rounded-lg"><label className="block text-sm font-bold text-gray-700 mb-1">Email del Bar</label><input className="w-full p-2 border rounded" value={settings.emailBar} onChange={e => setSettings({ ...settings, emailBar: e.target.value })} /></div>
                            <div className="bg-gray-100 p-4 rounded-lg"><label className="block text-sm font-bold text-gray-700 mb-1">Telefono del Bar</label><input className="w-full p-2 border rounded" value={settings.phoneBar} onChange={e => setSettings({ ...settings, phoneBar: e.target.value })} /></div>
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
    const [appSettings, setAppSettings] = useState(INITIAL_SETTINGS);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [adminOverride, setAdminOverride] = useState(false);
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
    const todayDate = new Date();
    const todayStr = formatDate(todayDate);
    const [activeDates, setActiveDates] = useState(generateAllowedDates());
    const [time, setTime] = useState(new Date());

    useEffect(() => { const timer = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(timer); }, []);
    const hour = time.getHours();
    const minute = time.getMinutes();
    const isLateWarning = !adminOverride && ((hour === 10 && minute >= 30) || (hour === 11) || (hour === 12 && minute < 30)); // 10:30 - 12:59
    const isBookingClosed = !adminOverride && ((hour === 12 && minute >= 0) || (hour > 12)); // 12:00+
    const isEmailClosed = !adminOverride && (hour >= 13); // 13:00+
    const isTodayAllowed = activeDates.includes(todayStr) || adminOverride;

    const forceStart = () => { setLoading(false); setDataLoaded(true); setIsAuthReady(true); console.warn("Avvio forzato."); };

    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) { setLoading(false); return; }
        const timeoutId = setTimeout(() => { forceStart(); }, 7000);
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
            setAuth(authInstance);
            const subscribeToData = () => {
                const unsubSettings = onSnapshot(doc(dbInstance, SETTINGS_DOC_PATH, 'main'), (snap) => { if (snap.exists()) setAppSettings(snap.data()); }, (err) => console.error(err));
                const unsubHolidays = onSnapshot(doc(dbInstance, HOLIDAYS_DOC_PATH), (snap) => { if (snap.exists()) setActiveDates(snap.data().activeDates || generateAllowedDates()); else setDoc(doc(dbInstance, HOLIDAYS_DOC_PATH), { activeDates: generateAllowedDates() }, { merge: true }).catch(console.error); }, (err) => console.error(err));
                const unsubOverride = onSnapshot(doc(dbInstance, CONFIG_DOC_PATH, 'override'), (snap) => { if (snap.exists()) setAdminOverride(snap.data().isOverride || false); }, (err) => console.error(err));
                return () => { unsubSettings(); unsubHolidays(); unsubOverride(); };
            };
            const initAuth = async () => { if (!authInstance.currentUser) { if (initialAuthToken) await signInWithCustomToken(authInstance, initialAuthToken).catch(() => signInAnonymously(authInstance)); else await signInAnonymously(authInstance); } };
            initAuth().then(() => { subscribeToData(); setDataLoaded(true); });
            onAuthStateChanged(authInstance, (u) => { if (u) { setIsAuthReady(true); setLoading(false); clearTimeout(timeoutId); } });
            return () => clearTimeout(timeoutId);
        } catch (e) { console.error("Errore init:", e); setLoading(false); }
    }, []);

    useEffect(() => {
        if (dataLoaded && isAuthReady && !user) { const savedUserId = sessionStorage.getItem('mealAppUser'); if (savedUserId) { const found = COLLEAGUES_LIST.find(c => c.id === savedUserId); if (found) { setUser(found); setActingAsUser(found); } } }
    }, [dataLoaded, isAuthReady]);

    useEffect(() => {
        if (!db || !isAuthReady) return;
        const docRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setOrders(data.orders || []);
                setOrderStatus(data.status || 'open');
                setOrderAuthor(data.confirmedBy || '');
                if (actingAsUser) {
                    const existingOrder = (data.orders || []).find(o => o.userId === actingAsUser.id);
                    if (existingOrder) { setDishName(existingOrder.itemName || ''); setSelectedWater(existingOrder.waterChoice || ''); setDiningChoice(existingOrder.isTakeout ? 'asporto' : 'bar'); }
                    else { setDishName(''); setSelectedWater(''); setDiningChoice(''); }
                }
            } else { setOrders([]); setOrderStatus('open'); setOrderAuthor(''); }
        }, (err) => { console.error("Errore listener ordini:", err); });
        return () => unsubscribe();
    }, [db, isAuthReady, todayStr, actingAsUser]);

    const handleLogin = (colleague) => { setUser(colleague); setActingAsUser(colleague); sessionStorage.setItem('mealAppUser', colleague.id); };
    const handleLogout = () => { setUser(null); setActingAsUser(null); sessionStorage.removeItem('mealAppUser'); setDishName(''); setSelectedWater(''); setDiningChoice(''); };
    const handleAdminUserChange = (e) => { const targetId = e.target.value; const targetUser = COLLEAGUES_LIST.find(c => c.id === targetId); if (targetUser) { setActingAsUser(targetUser); setMessage(''); } };
    const adminEditOrder = (targetUserId) => { const targetUser = COLLEAGUES_LIST.find(c => c.id === targetUserId); if (targetUser) setActingAsUser(targetUser); };
    const adminDeleteOrder = async (targetUserId) => { if (!confirm("Sei sicuro di voler eliminare questo ordine?")) return; try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== targetUserId) }); } catch (e) { console.error(e); } };

    const placeOrder = async () => {
        if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi modificare."); return; }
        if (!isTodayAllowed && !user.isAdmin) { alert("Oggi il servizio è chiuso e non puoi ordinare."); return; }
        if (isBookingClosed && !user.isAdmin) { alert("Troppo tardi! Sono passate le 12:00. Solo l'admin può modificare."); return; }
        const newErrors = {}; let hasError = false;
        if (!dishName || dishName.trim() === '') { newErrors.dishName = true; hasError = true; }
        if (!selectedWater) { newErrors.water = true; hasError = true; }
        if (!diningChoice) { newErrors.dining = true; hasError = true; }
        setErrors(newErrors);
        if (hasError) { setTimeout(() => alert("⚠️ Compila tutti i campi evidenziati in rosso!"), 100); return; }
        const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr);
        const cleanDishName = dishName.charAt(0).toUpperCase() + dishName.slice(1);
        const newOrder = { userId: actingAsUser.id, userName: actingAsUser.name, itemName: cleanDishName, waterChoice: selectedWater, isTakeout: diningChoice === 'asporto', timestamp: Date.now(), };
        try { await setDoc(orderRef, { mealDate: todayStr }, { merge: true }); const updatedOrders = orders.filter(o => o.userId !== actingAsUser.id).concat([newOrder]); await updateDoc(orderRef, { orders: updatedOrders }); if (user.id === actingAsUser.id) { setMessage("Ordine salvato! Ricordati di inviare se sei l'ultimo."); } else { setMessage(`Ordine salvato per ${actingAsUser.name}!`); } setErrors({}); } catch (e) { console.error(e); setMessage("Errore invio ordine"); }
    };

    const cancelOrder = async () => { if (orderStatus === 'sent' && !user.isAdmin) { alert("Ordine già inviato al bar! Non puoi cancellare."); return; } try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await updateDoc(orderRef, { orders: orders.filter(o => o.userId !== actingAsUser.id) }); setDishName(''); setSelectedWater(''); setDiningChoice(''); setMessage("Ordine annullato 🗑️"); } catch (e) { console.error(e); } };
    const markAsSent = async () => { if (!confirm("Sei sicuro di aver inviato l'email? Questo bloccherà gli ordini per tutti.")) return; try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await setDoc(orderRef, { status: 'sent', confirmedBy: user.name }, { merge: true }); } catch (e) { console.error("Errore update status", e); } };
    const unlockOrder = async () => { if (!confirm("Vuoi davvero riaprire l'ordine? Gli utenti potranno modificare le loro scelte.")) return; try { const orderRef = doc(db, PUBLIC_ORDERS_COLLECTION, todayStr); await setDoc(doc(db, CONFIG_DOC_PATH, 'override'), { isOverride: false }, { merge: true }); await setDoc(doc(db, PUBLIC_ORDERS_COLLECTION, todayStr), { status: 'open', confirmedBy: '' }, { merge: true }); } catch (e) { console.error("Errore sblocco", e); } };
    const getAllEmails = () => { return COLLEAGUES_LIST.map(c => c.email).filter(email => email && email.includes('@')).join(','); };

    const generateEmailText = () => {
        const groupedDishes = orders.reduce((acc, o) => { const key = o.itemName.trim(); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
        const water = orders.reduce((acc, o) => { const w = o.waterChoice || 'Nessuna'; acc[w] = (acc[w] || 0) + 1; return acc; }, {});
        let text = `Ciao Laura,\n`;
        text += `ecco il riepilogo dell'ordine di oggi ${todayDate.toLocaleDateString('it-IT')}.\n`;
        text += `Ti segnalo gentilmente che gli ordini DA ASPORTO 🥡 e da consumare AL BAR ☕ sono tutti per le ore 13:30.\n`;
        text += `Grazie come sempre per la disponibilità!\nA dopo\n\n`;
        text += `=========================================\n`;
        text += `RIEPILOGO ORDINE DEL ${todayDate.toLocaleDateString('it-IT')}\n`;
        text += `TOTALE ORDINI: ${orders.length}\n`;
        text += `=========================================\n`;
        text += "\n--- 🍽️ PIATTI ---\n";
        Object.entries(groupedDishes).forEach(([name, count]) => { text += `${count}x 🥗 ${name}\n`; });
        text += "\n--- 💧 ACQUA ---\n";
        if (water['Naturale']) text += `${water['Naturale']}x 💧 Naturale\n`;
        if (water['Frizzante']) text += `${water['Frizzante']}x 🫧 Frizzante\n`;
        const sortedOrders = [...orders].sort((a, b) => a.userName.localeCompare(b.userName));
        const barOrders = sortedOrders.filter(o => !o.isTakeout);
        const takeoutOrders = sortedOrders.filter(o => o.isTakeout);
        text += "\n--- ☕ AL BAR ---\n";
        if (barOrders.length === 0) text += "Nessun ordine al bar.\n";
        barOrders.forEach((o, i) => { text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName}${o.waterChoice && o.waterChoice !== 'Nessuna' ? ` [${o.waterChoice}]` : ''}\n`; });
        text += "\n--- 🥡 DA ASPORTO ---\n";
        if (takeoutOrders.length === 0) text += "Nessun ordine da asporto.\n";
        takeoutOrders.forEach((o, i) => { text += `${i + 1}. ${o.userName}: 🥗 ${o.itemName}${o.waterChoice && o.waterChoice !== 'Nessuna' ? ` [${o.waterChoice}]` : ''}\n`; });
        return text;
    };

    const openGmail = () => { const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayDate.toLocaleDateString('it-IT')}`); const body = encodeURIComponent(generateEmailText()); const ccEmails = getAllEmails(); const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${appSettings.emailBar}&cc=${ccEmails}&su=${subject}&body=${body}`; window.open(gmailLink, '_blank'); };
    const openDefaultMail = () => { const subject = encodeURIComponent(`Ordine Pranzo Ufficio - ${todayDate.toLocaleDateString('it-IT')}`); const body = encodeURIComponent(generateEmailText()); const ccEmails = getAllEmails(); const mailtoLink = `mailto:${appSettings.emailBar}?cc=${ccEmails}&subject=${subject}&body=${body}`; window.location.href = mailtoLink; };
    const openLateEmail = () => { const subject = encodeURIComponent(`Ordine Tardivo/Personale - ${todayDate.toLocaleDateString('it-IT')}`); const body = encodeURIComponent(`Ciao, sono ${user.name}.\nVorrei ordinare per oggi:\n\n- [SCRIVI QUI IL PIATTO]\n\nGrazie!`); const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${appSettings.emailBar}&su=${subject}&body=${body}`; window.open(gmailLink, '_blank'); };

    if (loading || !dataLoaded) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner text="Connessione al database..." onForceStart={forceStart} /></div>;
    if (!user) return <LoginScreen onLogin={handleLogin} colleagues={COLLEAGUES_LIST} />;

    // SORTING & FILTERING
    const sortedOrders = [...orders].sort((a, b) => a.userName.localeCompare(b.userName));
    const barOrders = sortedOrders.filter(o => !o.isTakeout);
    const takeoutOrders = sortedOrders.filter(o => o.isTakeout);
    const isClosedView = (!isTodayAllowed && !adminOverride);

    return (
        <div className={`min-h-screen font-sans p-2 sm:p-6 pb-20 transition-colors duration-500 bg-gray-100`}>
            <div className={`max-w-5xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden relative transition-all duration-300`}>
                <div className="absolute top-4 right-4 z-50 flex gap-2">
                    {user.isAdmin && ( <> <button onClick={() => setShowAdminPanel(true)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-orange-400">📅 Gestione</button> <button onClick={() => setShowHistory(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-purple-500">📜 Storico</button> </> )}
                    {!user.isAdmin && ( <button onClick={() => setShowHistory(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-purple-500">📜 Storico</button> )}
                    <button onClick={() => setShowHelp(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-blue-500 flex items-center gap-1"><span>ℹ️</span> Guida</button>
                    <button onClick={handleLogout} className="bg-white/90 hover:bg-white text-gray-800 text-xs px-3 py-1 rounded-full shadow backdrop-blur-sm border border-gray-200">Esci ({user.name})</button>
                </div>

                {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
                {showAdminPanel && <AdminPanel db={db} onClose={() => setShowAdminPanel(false)} colleaguesList={COLLEAGUES_LIST} adminOverride={adminOverride} onToggleForceOpen={setAdminOverride} todayStr={todayStr} adminName={user.name} />}
                {showHistory && <AdminHistory db={db} onClose={() => setShowHistory(false)} user={user} />}

                <header className="relative text-white overflow-hidden border-b-4 border-green-800 bg-cover bg-center" style={{ backgroundColor: '#15803d', backgroundImage: BANNER_IMAGE_URL ? `url(${BANNER_IMAGE_URL})` : 'none' }}>
                    <div className={`absolute inset-0 ${BANNER_IMAGE_URL ? 'bg-black/60' : 'bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-200/10 to-green-900'}`}></div>
                    <div className="relative z-10 p-6 pt-10 flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-4">
                        <div><h1 className="text-4xl font-extrabold tracking-tight uppercase drop-shadow-lg" style={{ fontFamily: 'serif' }}>7 MILA CAFFÈ</h1><div className="flex items-center justify-center md:justify-start gap-2 mt-1"><span className="bg-white/90 text-green-800 px-2 py-0.5 rounded text-xs font-bold tracking-widest shadow-sm">TEL. {appSettings.phoneBar}</span></div></div>
                        <div className="hidden md:block max-w-md italic font-serif text-green-50 text-lg border-l-2 border-green-400 pl-4 drop-shadow-md">"Anche nel caos del lavoro,<br />il pranzo resta un momento sacro."</div>
                    </div>
                </header>

                <div className="bg-gray-800 text-white p-3 shadow-inner">
                    <div className="flex flex-col sm:flex-row justify-between items-center text-sm px-2 sm:px-4 mb-2 gap-2">
                        <div className="font-medium text-gray-300">Data: <span className="text-white font-bold uppercase">{todayDate.toLocaleDateString('it-IT')}</span></div>
                        <div className="font-mono font-bold text-white flex items-center gap-2">
                            {adminOverride && <span className="text-green-300 font-bold hidden sm:inline">🔓 OVERRIDE ADMIN ATTIVO </span>}
                            {isLateWarning && !adminOverride && <span className="text-yellow-300 font-bold hidden sm:inline">⚠️ IN CHIUSURA </span>}
                            {isEmailClosed && !adminOverride && <span className="text-red-400 font-bold hidden sm:inline">🛑 TEMPO SCADUTO </span>}
                            {time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs sm:text-sm">
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${orderStatus !== 'sent' && !isBookingClosed && isTodayAllowed ? 'bg-green-600 font-bold' : 'bg-gray-700 text-gray-400'}`}><span className="bg-white text-gray-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">1</span>Raccolta</div>
                        <div className="h-0.5 w-4 bg-gray-600"></div>
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${orderStatus === 'sent' ? 'bg-green-600 font-bold' : 'bg-gray-700 text-gray-400'}`}><span className="bg-white text-gray-900 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">2</span>Inviato</div>
                    </div>
                </div>

                {isLateWarning && !isClosedView && (
                    <div className="bg-red-100 border-b-4 border-red-500 p-4 text-center sticky top-0 z-40 shadow-xl animate-pulse">
                        <h2 className="text-red-800 font-bold text-xl uppercase mb-2">⏰ È Tardi! Chiudi l'ordine</h2>
                        <p className="text-red-600 mb-4 text-sm font-bold">Sono passate le 10:30. Il primo che vede questo messaggio deve inviare l'email!</p>
                        <div className="flex justify-center gap-2"><button onClick={openGmail} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-full shadow-lg text-sm">📧 GMAIL WEB (PC)</button><button onClick={openDefaultMail} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-full shadow-lg text-sm">📱 APP EMAIL</button></div>
                    </div>
                )}

                {isEmailClosed && !isClosedView && (
                    <div className="bg-gray-900 border-b-4 border-red-600 p-6 text-center sticky top-0 z-50 shadow-2xl">
                        <h2 className="text-white font-bold text-2xl uppercase mb-2">🛑 ORDINE WEB CHIUSO</h2>
                        <p className="text-gray-300 mb-4 text-sm">Sono passate le 13:00. Non inviare più email, il bar non la leggerebbe.</p>
                        <a href={`tel:${appSettings.phoneBar}`} className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full shadow-lg text-lg animate-bounce">📞 CHIAMA IL BAR: {appSettings.phoneBar}</a>
                        {user.isAdmin && ( <div className="mt-4 border-t border-gray-700 pt-4"><p className="text-xs text-gray-400 mb-2">Area Admin: Puoi forzare l'invio se necessario.</p><div className="flex justify-center gap-2"><button onClick={openGmail} className="bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-4 rounded border border-gray-500">Forza Gmail</button><button onClick={openDefaultMail} className="bg-gray-700 hover:bg-gray-600 text-white text-xs py-2 px-4 rounded border border-gray-500">Forza App Mail</button><button onClick={markAsSent} className="bg-green-700 hover:bg-green-600 text-white text-xs py-2 px-4 rounded border border-green-500">Forza "Inviato"</button></div></div>)}
                    </div>
                )}

                <main className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-6">
                        <div className={`bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-2 ${user.isAdmin ? 'border-l-4 border-l-orange-400' : ''}`}>
                            <div className="flex items-center gap-3"><span className="text-blue-800 font-medium">Ciao,</span><span className="font-bold text-xl text-blue-900">{user.name}</span>{user.isAdmin && <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded border border-orange-300">ADMIN</span>}</div>
                            {user.isAdmin && ( <div className="mt-2 pt-2 border-t border-blue-200"><label className="text-xs font-bold text-orange-700 uppercase block mb-1">👑 Admin: Stai ordinando per...</label><select value={actingAsUser.id} onChange={handleAdminUserChange} className="w-full p-2 text-sm border border-orange-300 rounded bg-white focus:ring-2 focus:ring-orange-500 outline-none">{COLLEAGUES_LIST.map(c => ( <option key={c.id} value={c.id}>{c.id === user.id ? 'Me Stesso' : c.name}</option> ))}</select></div>)}
                        </div>

                        <div className={`bg-white border-2 p-5 rounded-xl shadow-lg transition-colors ${errors.dishName ? 'border-red-500 ring-4 ring-red-100' : 'border-slate-200'}`}>
                            {!isTodayAllowed && !adminOverride ? (
                                <div className="text-center py-10 text-gray-500"><h3 className="text-xl font-bold mb-2 text-gray-400">😴 Oggi Riposo</h3><p className="text-sm">Oggi il servizio prenotazione è chiuso.</p><p className="text-xs mt-2">Puoi comunque consultare il tuo Storico.</p></div>
                            ) : (
                                <>
                                    <h3 className={`font-bold mb-3 text-sm uppercase tracking-wide border-b pb-1 ${errors.dishName ? 'text-red-600 border-red-200' : 'text-gray-700'}`}>1. Cosa mangi oggi?</h3>
                                    <input value={dishName} onChange={(e) => { setDishName(e.target.value); if (errors.dishName) setErrors(prev => ({ ...prev, dishName: false })); }} disabled={orderStatus === 'sent' || isBookingClosed} placeholder={(orderStatus === 'sent' || isBookingClosed) ? "Ordine chiuso" : "Es: Insalatona pollo e noci..."} className={`w-full border-2 p-3 rounded-lg text-lg font-bold text-gray-800 outline-none transition-all placeholder:font-normal placeholder:text-gray-300 ${errors.dishName ? 'border-red-400 bg-red-50' : 'border-green-100 focus:border-green-500'} ${(orderStatus === 'sent' || isBookingClosed) ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`} />
                                </>
                            )}
                        </div>

                        {!isClosedView && (
                            <div className={`bg-white border-2 border-slate-200 p-5 rounded-xl shadow-lg sticky bottom-4 z-20 ${orderStatus === 'sent' || isBookingClosed ? 'opacity-75 grayscale' : ''}`}>
                                <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide border-b pb-1">2. Completa il tuo ordine</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                    <div>
                                        <label className={`block text-xs font-bold uppercase mb-2 ${errors.water ? 'text-red-600' : 'text-gray-500'}`}>Scelta Acqua *</label>
                                        <div className="flex gap-2 h-20">{['Nessuna', 'Naturale', 'Frizzante'].map(opt => ( <div key={opt} className={`flex-1 ${orderStatus === 'sent' || isBookingClosed ? 'pointer-events-none' : ''}`} onClick={() => { if (orderStatus !== 'sent' && !isBookingClosed) { setSelectedWater(opt); if (errors.water) setErrors(prev => ({ ...prev, water: false })); } }}><WaterIcon type={opt} selected={selectedWater === opt} hasError={errors.water} /></div> ))}</div>
                                    </div>
                                    <div>
                                        <label className={`block text-xs font-bold uppercase mb-2 ${errors.dining ? 'text-red-600' : 'text-gray-500'}`}>Dove mangi? *</label>
                                        <div className="flex gap-2 h-20">{['bar', 'asporto'].map(choice => ( <button key={choice} disabled={orderStatus === 'sent' || isBookingClosed} onClick={() => { setDiningChoice(choice); if (errors.dining) setErrors(prev => ({ ...prev, dining: false })); }} className={`flex-1 flex flex-col items-center justify-center rounded-lg border transition-all ${ diningChoice === choice ? (choice === 'bar' ? 'bg-orange-100 border-orange-500 ring-2 ring-orange-400 text-orange-800' : 'bg-red-100 border-red-500 ring-2 ring-red-400 text-red-800') + ' font-bold' : errors.dining ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50' }`}><span className="text-2xl">{choice === 'bar' ? '☕' : '🥡'}</span><span className="text-xs mt-1 font-bold uppercase">{choice === 'bar' ? 'Al Bar' : 'Asporto'}</span></button> ))}</div>
                                    </div>
                                </div>
                                <div className="pt-2 border-t mt-2">
                                    {orderStatus === 'sent' && !user.isAdmin ? ( <div className="bg-green-100 p-3 rounded-lg text-center border border-green-300"><span className="text-green-800 font-bold text-lg">🔒 Ordine Inviato</span><p className="text-green-700 text-xs">Non è più possibile modificare le scelte.</p></div> ) : isBookingClosed && !user.isAdmin ? ( <div className="bg-red-100 p-3 rounded-lg text-center border border-red-300"><span className="text-red-800 font-bold text-lg">🛑 Ordini Chiusi</span><p className="text-red-700 text-xs">Le prenotazioni chiudono alle 12:00.</p></div> ) : orders.some(o => o.userId === actingAsUser.id) ? ( <div className="flex items-center justify-between bg-green-50 p-2 rounded border border-green-200"><div><span className="text-green-800 font-bold text-sm block">Ordine Salvato!</span><span className="text-green-600 text-xs truncate max-w-[150px] inline-block">{dishName}</span>{user.isAdmin && actingAsUser.id !== user.id && <span className="text-[10px] text-orange-600 block">(per {actingAsUser.name})</span>}</div><button onClick={cancelOrder} className="text-xs text-red-600 underline hover:text-red-800 font-bold px-2 py-1 rounded hover:bg-red-50">Cancella</button></div> ) : ( <button onClick={placeOrder} className={`w-full text-white py-3 rounded-lg font-bold shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wide ${user.isAdmin && actingAsUser.id !== user.id ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'}`}><span>{user.isAdmin && actingAsUser.id !== user.id ? `📨 Ordina per ${actingAsUser.name.split(' ')[0]}` : '📨 Salva la tua scelta'}</span></button> )}
                                    {message && orderStatus !== 'sent' && !isBookingClosed && <p className={`text-center font-bold mt-2 text-sm animate-pulse ${message.includes('Errore') || message.includes('evidenziati') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-slate-100 p-4 rounded-lg border border-slate-300 shadow-sm">
                            <h3 className="font-bold text-slate-700 mb-4 text-sm uppercase flex items-center gap-2"><span>🚀</span> Zona Invio</h3>
                            {(isClosedView || isEmailClosed) && orderStatus !== 'sent' ? (
                                <div className="space-y-3">
                                    <div className="bg-red-50 border border-red-200 p-3 rounded text-center"><p className="text-red-700 font-bold text-sm mb-1">⛔ TEMPO SCADUTO / CHIUSO</p><p className="text-xs text-gray-600">Non è possibile inviare l'ordine di gruppo.</p></div>
                                    <a href={`tel:${appSettings.phoneBar}`} className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded text-center shadow-md transition-colors">📞 CHIAMA IL BAR</a>
                                    <button onClick={openLateEmail} className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded text-center shadow-md transition-colors">✉️ MAIL DIRETTA (Personale)</button>
                                    <p className="text-[10px] text-gray-500 text-center mt-1">Apre la tua mail solo verso il bar (no colleghi in copia).</p>
                                    {user.isAdmin && ( <div className="pt-4 mt-4 border-t border-gray-300"><p className="text-xs font-bold text-orange-600 mb-2 text-center">🛠️ Admin Override</p><button onClick={markAsSent} className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded text-xs mb-2">Forza stato "INVIATO"</button></div> )}
                                </div>
                            ) : orderStatus === 'sent' ? (
                                <div className="text-center p-4 bg-white rounded border border-green-200"><div className="text-4xl mb-2">✅</div><p className="text-green-800 font-bold">Email Inviata da {orderAuthor || 'un collega'}</p><p className="text-xs text-gray-500">L'ordine è chiuso.</p>{user.isAdmin && ( <button onClick={unlockOrder} className="mt-3 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded border border-gray-400">🔓 Sblocca Ordine (Solo Admin)</button> )}</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative border-l-2 border-blue-400 pl-4 ml-2"><div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div><h4 className="text-sm font-bold text-blue-800 mb-1">Fase 1: Invia l'Email</h4><p className="text-xs text-slate-500 mb-2">Apri il tuo programma di posta. Il testo è già pronto.</p><div className="grid gap-2"><button onClick={openGmail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-red-200 text-red-700 hover:bg-red-50"><span className="text-lg">🔴</span> Gmail Web (PC)</button><button onClick={openDefaultMail} className="w-full border py-2 rounded font-bold shadow-sm flex items-center justify-center gap-2 text-sm bg-white border-slate-300 text-slate-700 hover:bg-slate-50"><span className="text-lg">📱</span> App Email (Mobile)</button></div></div>
                                    <div className="relative border-l-2 border-green-400 pl-4 ml-2"><div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-green-500 border-2 border-white"></div><h4 className="text-sm font-bold text-green-800 mb-1">Fase 2: Conferma nel sistema</h4><p className="text-xs text-slate-500 mb-2">Solo DOPO aver inviato l'email reale, clicca qui per chiudere l'ordine.</p><button onClick={markAsSent} className="w-full py-3 rounded font-bold shadow flex items-center justify-center gap-2 text-sm bg-green-600 hover:bg-green-700 text-white animate-pulse"><span>✅</span> CONFERMA INVIO</button></div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-4 rounded-xl shadow border h-full max-h-[600px] overflow-y-auto">
                            <h3 className="font-bold text-gray-800 border-b pb-2 mb-2 flex justify-between items-center"><span>👀 Riepilogo Ordini</span><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{orders.length}</span></h3>
                            <div className="space-y-6">
                                {barOrders.length > 0 && (
                                    <div>
                                        <h4 className="text-orange-700 font-bold border-b-2 border-orange-200 mb-2 pb-1 sticky top-0 bg-white z-10 flex items-center gap-2 text-sm">☕ AL BAR <span className="bg-orange-100 text-xs px-2 rounded-full">{barOrders.length}</span></h4>
                                        <div className="space-y-2">{barOrders.map((order, i) => ( <div key={order.userId} className="text-sm flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group relative"><div className="flex items-center gap-2 overflow-hidden w-full"><span className="text-gray-400 font-mono text-xs w-4">{i + 1}.</span><span className="font-bold text-gray-700 whitespace-nowrap">{order.userName}</span><span className="text-gray-600 truncate text-xs flex-1">- 🥗 {order.itemName}</span>{user.isAdmin && ( <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => adminEditOrder(order.userId)} className="text-xs bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200" title="Modifica">✏️</button><button onClick={() => adminDeleteOrder(order.userId)} className="text-xs bg-red-100 text-red-600 p-1 rounded hover:bg-red-200" title="Elimina">🗑️</button></div> )}</div>{order.waterChoice && order.waterChoice !== 'Nessuna' && ( <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 ml-2">{order.waterChoice === 'Naturale' ? '💧' : '🫧'}</span> )}</div> ))}</div>
                                    </div>
                                )}
                                {takeoutOrders.length > 0 && (
                                    <div>
                                        <h4 className="text-red-700 font-bold border-b-2 border-red-200 mb-2 pb-1 sticky top-0 bg-white z-10 flex items-center gap-2 text-sm">🥡 DA ASPORTO <span className="bg-red-100 text-xs px-2 rounded-full">{takeoutOrders.length}</span></h4>
                                        <div className="space-y-2">{takeoutOrders.map((order, i) => ( <div key={order.userId} className="text-sm flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 group relative"><div className="flex items-center gap-2 overflow-hidden w-full"><span className="text-gray-400 font-mono text-xs w-4">{i + 1}.</span><span className="font-bold text-gray-700 whitespace-nowrap">{order.userName}</span><span className="text-gray-600 truncate text-xs flex-1">- 🥗 {order.itemName}</span>{user.isAdmin && ( <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => adminEditOrder(order.userId)} className="text-xs bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200" title="Modifica">✏️</button><button onClick={() => adminDeleteOrder(order.userId)} className="text-xs bg-red-100 text-red-600 p-1 rounded hover:bg-red-200" title="Elimina">🗑️</button></div> )}</div>{order.waterChoice && order.waterChoice !== 'Nessuna' && ( <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 ml-2">{order.waterChoice === 'Naturale' ? '💧' : '🫧'}</span> )}</div> ))}</div>
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
