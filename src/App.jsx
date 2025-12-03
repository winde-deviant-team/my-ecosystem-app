import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, ClipboardList, FileText, Receipt, Trash2, PlusCircle, ArrowRight, X, Loader2, Download, Bell, Eye, CheckCircle, Clock
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, getDocs
} from 'firebase/firestore';

// --- FIREBASE INITIALIZATION & UTILITIES ---

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// *** FINAL HARDCODED CONFIGURATION (Insecure but guaranteed to start) ***
const firebaseConfig = { 
  apiKey: "PASTE YOUR API KEY HERE AS A STRING", 
  authDomain: "PASTE YOUR AUTH DOMAIN HERE",
  projectId: "PASTE YOUR PROJECT ID HERE",
  // Include any other config keys you received here
};

// Eliminate the initialAuthToken variable entirely to simplify startup
// const initialAuthToken = null; 

// Helper to format dates for display
// ... (rest of the file remains the same)


// The main App component
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data states
  const [appointments, setAppointments] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  
  const [activeTab, setActiveTab] = useState('appointments');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  // Modal State for Receipt Viewing/Printing
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState(null);

  // New states for Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState({ filename: '', data: '' });

  // Mock Calendar/Booking Status Modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingStatus, setBookingStatus] = useState({ type: '', message: '', time: '' });


  // Initialize Firebase and handle Authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);

      // Log the required debug level for Firestore
      // setLogLevel('Debug'); // Kept commented unless explicitly required for debugging
      
      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
          // console.log("Firebase Auth State Changed: User signed in.", user.uid);
        } else {
          // If no user, try to sign in using token or anonymously
          if (initialAuthToken) {
            signInWithCustomToken(authInstance, initialAuthToken)
              .then(userCredential => {
                setUserId(userCredential.user.uid);
              })
              .catch(error => {
                console.error("Error signing in with custom token, signing anonymously:", error);
                signInAnonymously(authInstance)
                  .then(anonUser => setUserId(anonUser.user.uid))
                  .catch(anonError => console.error("Error signing in anonymously:", anonError));
              });
          } else {
            signInAnonymously(authInstance)
              .then(anonUser => setUserId(anonUser.user.uid))
              .catch(anonError => console.error("Error signing in anonymously:", anonError));
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setIsAuthReady(true);
      setLoading(false);
    }
  }, []);

  // Show status messages
  const showStatus = (msg, type = 'success', duration = 3000) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, duration);
  };
  
  // Utility function to get collection reference
  const getCollectionRef = useCallback((collectionName) => {
    if (!db || !userId) return null;
    // Private data path: /artifacts/{appId}/users/{userId}/{collectionName}
    return collection(db, 'artifacts', appId, 'users', userId, collectionName);
  }, [db, userId]);

  // Real-time data listeners (onSnapshot)
  useEffect(() => {
    if (!isAuthReady || !userId || !db) {
      if (isAuthReady) setLoading(false);
      return;
    }
    
    const collections = [
      { name: 'appointments', setter: setAppointments },
      { name: 'quotations', setter: setQuotations },
      { name: 'invoices', setter: setInvoices },
      { name: 'receipts', setter: setReceipts },
    ];

    const unsubscribeListeners = collections.map(({ name, setter }) => {
      const colRef = getCollectionRef(name);
      if (!colRef) return () => {};

      const q = query(colRef);
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setter(data);
        // console.log(`${name} fetched:`, data.length);
        setLoading(false);
      }, (error) => {
        console.error(`Error fetching ${name}:`, error);
        showStatus(`Failed to load ${name}.`, 'error');
        setLoading(false);
      });
      return unsubscribe;
    });

    return () => unsubscribeListeners.forEach(unsub => unsub());
  }, [isAuthReady, userId, db, getCollectionRef]);

  // --- CRUD Operations ---
  
  const handleAddOrUpdate = async (collectionName, data, id = null) => {
    const colRef = getCollectionRef(collectionName);
    if (!colRef) return showStatus("Authentication not ready. Please wait.", 'error');

    try {
      // Remove isConfirmed status before saving to DB, as it's a transient UI state for the mock
      const { isConfirmed, ...dataToSave } = data; 
      
      if (id) {
        await updateDoc(doc(colRef, id), dataToSave);
        showStatus(`${collectionName.slice(0, -1)} updated successfully!`);
      } else {
        await addDoc(colRef, dataToSave);
        showStatus(`${collectionName.slice(0, -1)} added successfully!`);
      }
      setShowForm(false);
    } catch (e) {
      console.error("Error writing document: ", e);
      showStatus(`Failed to save ${collectionName.slice(0, -1)}.`, 'error');
    }
  };

  const handleDelete = async (collectionName, id) => {
    const colRef = getCollectionRef(collectionName);
    if (!colRef) return showStatus("Authentication not ready. Please wait.", 'error');

    try {
      await deleteDoc(doc(colRef, id));
      showStatus(`${collectionName.slice(0, -1)} deleted successfully!`);
    } catch (e) {
      console.error("Error deleting document: ", e);
      showStatus(`Failed to delete ${collectionName.slice(0, -1)}.`, 'error');
    }
  };

  // --- Follow Up & Reminder Logic (omitted for brevity) ---

  const getDueReminders = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reminders = [];

    // Check Appointments (due today or tomorrow)
    appointments.forEach(app => {
      if (app.status === 'Scheduled' && app.date) {
        const appDate = new Date(app.date);
        appDate.setHours(0, 0, 0, 0);

        if (appDate.getTime() === today.getTime()) {
          reminders.push({ 
            type: 'Appointment', 
            client: app.clientName, 
            details: `Today at ${app.time} for ${app.title}`,
            color: 'bg-indigo-100 text-indigo-800'
          });
        } else if (appDate.getTime() === tomorrow.getTime()) {
          reminders.push({ 
            type: 'Appointment', 
            client: app.clientName, 
            details: `Tomorrow at ${app.time} for ${app.title}`,
            color: 'bg-blue-100 text-blue-800'
          });
        }
      }
    });

    // Check Invoices (pending)
    invoices.forEach(invoice => {
      if (invoice.status === 'Pending') {
        reminders.push({
          type: 'Invoice Follow Up',
          client: invoice.clientName,
          details: `Pending payment of $${invoice.total.toFixed(2)} (Issued: ${invoice.date})`,
          color: 'bg-yellow-100 text-yellow-800'
        });
      }
    });

    return reminders;
  }, [appointments, invoices]);

  const RemindersBox = () => {
    const reminders = getDueReminders();
    
    if (reminders.length === 0) {
      return (
        <div className="bg-white p-4 rounded-xl shadow border border-gray-100 mb-6 flex items-center justify-center text-sm text-gray-500">
          <Bell className="w-4 h-4 mr-2" /> All clear! No immediate appointments or pending invoice follow-ups.
        </div>
      );
    }
    
    return (
      <div className="bg-white p-4 rounded-xl shadow-lg border border-indigo-200 mb-6">
        <h2 className="text-lg font-bold text-red-600 mb-3 flex items-center">
          <Bell className="w-5 h-5 mr-2 animate-pulse" />
          Immediate Follow-Ups ({reminders.length})
        </h2>
        <div className="space-y-2">
          {reminders.map((r, index) => (
            <div key={index} className={`p-3 rounded-lg flex justify-between items-center ${r.color}`}>
              <div className="text-sm">
                <span className="font-semibold mr-1">{r.type}:</span> {r.client}
                <p className="text-xs opacity-80">{r.details}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // --- Google Sheet Export Logic (Mock) (omitted for brevity) ---

  const toCSV = (data, title) => {
    if (data.length === 0) return `No ${title} data available for export.`;
    const headers = Object.keys(data[0]).filter(key => key !== 'id');
    const headerRow = headers.map(h => `"${h}"`).join(',');
    const dataRows = data.map(item => {
      return headers.map(header => {
        let value = item[header];
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    }).join('\n');
    return `${headerRow}\n${dataRows}`;
  };

  const handleExportToSheet = (type) => {
    let dataToExport = [];
    let filename = '';
    switch (type) {
      case 'appointments': dataToExport = appointments; filename = 'Appointments_Export.csv'; break;
      case 'quotations': dataToExport = quotations; filename = 'Quotations_Export.csv'; break;
      case 'invoices': dataToExport = invoices; filename = 'Invoices_Export.csv'; break;
      case 'receipts': dataToExport = receipts; filename = 'Receipts_Export.csv'; break;
      default: showStatus('Invalid export type.', 'error'); return;
    }
    const csvContent = toCSV(dataToExport, type);
    setExportData({ filename, data: csvContent });
    setShowExportModal(true);
    showStatus(`Generated CSV data for ${type}. Ready to copy.`, 'success');
  };

  const ExportModal = ({ filename, data, onClose }) => {
    const handleCopy = () => {
      try {
        const el = document.createElement('textarea');
        el.value = data;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showStatus('CSV data copied to clipboard!', 'success');
      } catch (e) {
        console.error('Copy failed:', e);
        showStatus('Failed to copy data. Please copy manually.', 'error');
      }
    };

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-indigo-800">Export: {filename}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-3">Copy the CSV content below and paste it directly into a Google Sheet cell.</p>
          <textarea
            readOnly
            value={data}
            rows="10"
            className="w-full p-3 font-mono text-xs border border-gray-300 rounded-lg bg-gray-50 resize-none"
            onClick={(e) => e.target.select()}
          />
          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition shadow-md"
            >
              Copy to Clipboard
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition shadow">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // --- Form States for Adding New Entities ---

  const initialAppointmentState = { 
    clientName: '', 
    companyName: '', 
    address: '', 
    contact: '', 
    title: 'Content Protection', // Appointment title/service
    date: new Date().toISOString().substring(0, 10), 
    time: '', 
    status: 'Scheduled',
    meetingType: 'In-Person meeting', // UPDATED FIELD
    isConfirmed: false, // UI STATE for mock calendar
  };
  const initialQuotationState = { 
    clientName: '', 
    companyName: '',
    address: '',
    contact: '',
    items: '', 
    total: 0, 
    date: new Date().toISOString().substring(0, 10), 
    status: 'Draft',
    serviceType: 'Content Protection',
    period: '12 Months',
    paymentTerm: 'Net 30',
    appointmentId: '', // Link to the appointment
  };
  const initialInvoiceState = { 
    clientName: '', 
    companyName: '',
    address: '',
    contact: '',
    items: '', 
    total: 0, 
    date: new Date().toISOString().substring(0, 10), 
    status: 'Pending', 
    quoteId: '' 
  };
  const initialReceiptState = { 
    clientName: '', 
    amount: 0, 
    datePaid: new Date().toISOString().substring(0, 10), 
    invoiceId: '', 
    // Additional fields needed for the receipt document
    companyName: '',
    address: '',
    contact: '',
    description: '',
  };

  const [formAppointment, setFormAppointment] = useState(initialAppointmentState);
  const [formQuotation, setFormQuotation] = useState(initialQuotationState);
  const [formInvoice, setFormInvoice] = useState(initialInvoiceState);
  const [formReceipt, setFormReceipt] = useState(initialReceiptState);

  // Helper to handle form input changes
  const handleFormChange = (formSetter) => (e) => {
    const { name, value } = e.target;
    // When changing meeting type, reset confirmation status
    if (name === 'meetingType') {
        formSetter(prev => ({ 
            ...prev, 
            [name]: value,
            isConfirmed: false 
        }));
    } else {
        formSetter(prev => ({ ...prev, [name]: name === 'total' || name === 'amount' ? Number(value) : value }));
    }
  };

  // --- Mock Calendar Booking Logic ---

  const handleMockBooking = () => {
    // Check if date and time are set
    if (!formAppointment.date || !formAppointment.time) {
        showStatus('Please select both a date and a time before checking availability.', 'error');
        return;
    }

    // Simulate API call delay
    showStatus('Checking Google Calendar availability...', 'success', 5000);
    
    setTimeout(() => {
        const isAvailable = Math.random() > 0.3; // 70% chance of success

        if (isAvailable) {
            setBookingStatus({
                type: 'success',
                message: "Time slot is available and tentatively booked! (A real integration would send the invite now)",
                time: `${formatDate(formAppointment.date)} @ ${formAppointment.time}`
            });
            setFormAppointment(prev => ({ ...prev, isConfirmed: true })); 
        } else {
            setBookingStatus({
                type: 'error',
                message: "This time slot is busy on your Google Calendar. Please select an alternative time.",
                time: ''
            });
            setFormAppointment(prev => ({ ...prev, isConfirmed: false })); 
        }
        setShowBookingModal(true);
    }, 1500);
  };
  
  const MockBookingModal = ({ status, onClose }) => {
    const Icon = status.type === 'success' ? CheckCircle : X;
    const color = status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
          <div className={`flex items-center space-x-3 p-3 rounded-lg ${color} mb-4`}>
            <Icon className="w-6 h-6" />
            <h3 className="font-bold text-lg">{status.type === 'success' ? 'Booking Confirmed (Mock)' : 'Booking Conflict (Mock)'}</h3>
          </div>
          <p className="text-gray-700 mb-4">{status.message}</p>
          {status.time && (
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                  <Clock className="inline w-4 h-4 mr-1" /> Time: {status.time}
              </p>
          )}
          <div className="mt-6">
              <p className="text-xs text-indigo-600 mb-2 border-t pt-2">
                  *Disclaimer: This is a simulation. A real application would require OAuth 2.0 to access the Google Calendar API.
              </p>
              <button 
                  onClick={onClose} 
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-md"
              >
                  Close
              </button>
          </div>
        </div>
      </div>
    );
  };


  // --- Entity Specific Render Functions (omitted for brevity) ---
  
  const renderAppointments = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {appointments.length === 0 ? (
          <p className="col-span-full text-center py-8 text-gray-500">No appointments scheduled yet.</p>
        ) : (
          appointments.map(app => (
            <div key={app.id} className="bg-white p-5 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-indigo-700 truncate">{app.clientName}</h3>
                <StatusBadge status={app.status} />
              </div>
              
              <p className="text-sm text-gray-900 mb-2 font-bold">{app.title}</p>

              <p className="text-sm text-gray-600 mb-1">Type: <span className="font-medium">{app.meetingType || 'In-Person meeting'}</span></p>
              <p className="text-sm text-gray-600 mb-1">Company: <span className="font-medium">{app.companyName}</span></p>
              <p className="text-sm text-gray-600 mb-1">Address: <span className="font-medium">{app.address}</span></p>
              <p className="text-sm text-gray-600 mb-3">Contact: <span className="font-medium">{app.contact}</span></p>

              <p className="text-sm text-gray-600 mb-3">
                <Calendar className="inline w-4 h-4 mr-1 text-gray-500" />
                {app.date} @ {app.time}
              </p>
              <div className="flex justify-end space-x-2">
                {app.status === 'Scheduled' && (
                  <button
                    onClick={() => handleCreateQuoteFromAppointment(app)}
                    className="p-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition flex items-center"
                  >
                    <ArrowRight className="w-3 h-3 mr-1" /> Create Quote
                  </button>
                )}
                {app.status === 'Scheduled' && (
                  <button
                    onClick={() => handleUpdateStatus('appointments', app.id, 'Completed')}
                    className="p-2 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition"
                  >
                    Mark Complete
                  </button>
                )}
                <button
                  onClick={() => handleDelete('appointments', app.id)}
                  className="p-2 text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {showForm && (
        <AppointmentForm 
          formData={formAppointment} 
          handleChange={handleFormChange(setFormAppointment)} 
          handleSubmit={() => handleAddOrUpdate('appointments', formAppointment)}
          handleCancel={() => setShowForm(false)}
          handleMockBooking={handleMockBooking}
        />
      )}
    </div>
  );
  
  const renderQuotations = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quotations.length === 0 ? (
          <p className="col-span-full text-center py-8 text-gray-500">No quotations created yet.</p>
        ) : (
          quotations.map(quote => (
            <div key={quote.id} className="bg-white p-5 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-indigo-700 truncate">{quote.clientName}</h3>
                <StatusBadge status={quote.status} />
              </div>
              
              {quote.companyName && <p className="text-sm text-gray-500 -mt-1 truncate">{quote.companyName}</p>}

              {quote.appointmentId && (
                <p className="text-xs text-blue-500 mb-1">From Appointment: {quote.appointmentId.substring(0, 8)}...</p>
              )}
              <p className="text-sm text-gray-600 mb-1">Type: <span className="font-medium">{quote.serviceType}</span></p>
              <p className="text-sm text-gray-600 mb-1">Period: <span className="font-medium">{quote.period}</span></p>
              <p className="text-sm text-gray-600 mb-1">Term: <span className="font-medium">{quote.paymentTerm}</span></p>
              
              <p className="text-sm text-gray-600 mb-1">Items: <span className="font-medium italic">{quote.items.substring(0, 50)}...</span></p>
              <p className="text-sm text-gray-600 mb-1">Date: {quote.date}</p>
              <p className="text-xl font-bold text-green-600 mb-3">${quote.total.toFixed(2)}</p>
              
              <div className="flex justify-end space-x-2">
                {quote.status !== 'Accepted' && quote.status !== 'Rejected' && (
                  <button
                    onClick={() => handleUpdateStatus('quotations', quote.id, 'Accepted')}
                    className="p-2 text-xs font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition"
                  >
                    Mark Accepted
                  </button>
                )}
                {quote.status === 'Accepted' && (
                  <button
                    onClick={() => handleCreateInvoiceFromQuote(quote)}
                    className="p-2 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200 transition flex items-center"
                  >
                    <ArrowRight className="w-3 h-3 mr-1" /> Create Invoice
                  </button>
                )}
                <button
                  onClick={() => handleDelete('quotations', quote.id)}
                  className="p-2 text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {showForm && (
        <QuotationForm 
          formData={formQuotation} 
          handleChange={handleFormChange(setFormQuotation)} 
          handleSubmit={() => handleAddOrUpdate('quotations', formQuotation)}
          handleCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );

  const renderInvoices = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {invoices.length === 0 ? (
          <p className="col-span-full text-center py-8 text-gray-500">No invoices issued yet.</p>
        ) : (
          invoices.map(invoice => (
            <div key={invoice.id} className="bg-white p-5 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-indigo-700 truncate">{invoice.clientName}</h3>
                <StatusBadge status={invoice.status} />
              </div>
              {invoice.companyName && <p className="text-sm text-gray-500 -mt-1 truncate">{invoice.companyName}</p>}

              {invoice.quoteId && (
                <p className="text-xs text-indigo-500 mb-1">From Quote: {invoice.quoteId.substring(0, 8)}...</p>
              )}
              <p className="text-sm text-gray-600 mb-1">Items: <span className="font-medium italic">{invoice.items.substring(0, 50)}...</span></p>
              <p className="text-sm text-gray-600 mb-1">Date: {invoice.date}</p>
              <p className="text-xl font-bold text-green-600 mb-3">${invoice.total.toFixed(2)}</p>
              
              <div className="flex justify-end space-x-2">
                {invoice.status === 'Pending' && (
                  <button
                    onClick={() => handleCreateReceiptFromInvoice(invoice)}
                    className="p-2 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition flex items-center"
                  >
                    <ArrowRight className="w-3 h-3 mr-1" /> Record Payment
                  </button>
                )}
                <button
                  onClick={() => handleDelete('invoices', invoice.id)}
                  className="p-2 text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {showForm && (
        <InvoiceForm 
          formData={formInvoice} 
          handleChange={handleFormChange(setFormInvoice)} 
          handleSubmit={() => handleAddOrUpdate('invoices', formInvoice)}
          handleCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );

  const renderReceipts = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {receipts.length === 0 ? (
          <p className="col-span-full text-center py-8 text-gray-500">No payment receipts recorded yet.</p>
        ) : (
          receipts.map(receipt => (
            <div key={receipt.id} className="bg-white p-5 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
              <h3 className="text-lg font-semibold text-indigo-700 truncate mb-1">Payment Received from {receipt.clientName}</h3>
              <p className="text-sm text-gray-600 mb-1">Date Paid: {receipt.datePaid}</p>
              {receipt.invoiceId && (
                <p className="text-xs text-indigo-500 mb-1">For Invoice: {receipt.invoiceId.substring(0, 8)}...</p>
              )}
              <p className="text-xl font-bold text-green-600 mb-3">${receipt.amount.toFixed(2)}</p>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => handleViewReceipt(receipt)}
                  className="p-2 text-blue-500 hover:text-blue-700 transition"
                  title="View Receipt Document"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete('receipts', receipt.id)}
                  className="p-2 text-red-500 hover:text-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {showForm && (
        <ReceiptForm 
          formData={formReceipt} 
          handleChange={handleFormChange(setFormReceipt)} 
          handleSubmit={() => handleAddOrUpdate('receipts', formReceipt)}
          handleCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
  
  // --- Status and Linking Handlers (omitted for brevity) ---

  const handleUpdateStatus = async (collectionName, id, newStatus) => {
    const statusMap = {
      'appointments': 'status',
      'quotations': 'status',
      'invoices': 'status',
    };
    
    if (!statusMap[collectionName]) return;

    try {
      const colRef = getCollectionRef(collectionName);
      if (!colRef) throw new Error("Collection reference is null.");
      
      await updateDoc(doc(colRef, id), {
        [statusMap[collectionName]]: newStatus
      });
      showStatus(`Status of ${collectionName.slice(0, -1)} ${id.substring(0, 4)}... updated to ${newStatus}.`);
    } catch (e) {
      console.error("Error updating status: ", e);
      showStatus(`Failed to update status.`, 'error');
    }
  };

  const handleCreateQuoteFromAppointment = (app) => {
    // Pre-fill quote form with client name, company/contact details, and service type from appointment title
    setFormQuotation({
      ...initialQuotationState, 
      clientName: app.clientName,
      companyName: app.companyName || '', // Inherit company name
      address: app.address || '',         // Inherit address
      contact: app.contact || '',         // Inherit contact
      serviceType: app.title, // Use appointment title as default service type
      appointmentId: app.id, // Link to the appointment
      items: `Proposal for ${app.title} services, following the meeting on ${app.date}.`,
    });
    setActiveTab('quotations');
    setShowForm(true);
    showStatus(`Drafting Quotation for ${app.clientName} based on Appointment ${app.id.substring(0, 4)}...`);
  };

  const handleCreateInvoiceFromQuote = (quote) => {
    // Pre-fill invoice form with client/financial details from quote
    setFormInvoice({
      ...initialInvoiceState,
      clientName: quote.clientName,
      companyName: quote.companyName || '', // Inherit company name
      address: quote.address || '',         // Inherit address
      contact: quote.contact || '',         // Inherit contact
      items: quote.items,
      total: quote.total,
      date: new Date().toISOString().substring(0, 10),
      status: 'Pending',
      quoteId: quote.id
    });
    setActiveTab('invoices');
    setShowForm(true);
    showStatus(`Drafting Invoice for ${quote.clientName} based on Quote ${quote.id.substring(0, 4)}...`);
  };

  const handleCreateReceiptFromInvoice = async (invoice) => {
    // 1. Update Invoice status to 'Paid'
    await handleUpdateStatus('invoices', invoice.id, 'Paid');
    
    // Find the original quote to get service details for description
    const relatedQuote = quotations.find(q => q.id === invoice.quoteId);
    const defaultDescription = relatedQuote 
      ? `${relatedQuote.serviceType} services for the period outlined in Quotation ${relatedQuote.id.substring(0, 4)}...`
      : invoice.items || 'Service payment against invoice.';

    // 2. Prepare Receipt form
    setFormReceipt({
      clientName: invoice.clientName,
      amount: invoice.total,
      datePaid: new Date().toISOString().substring(0, 10),
      invoiceId: invoice.id,
      companyName: invoice.companyName || '',
      address: invoice.address || '',
      contact: invoice.contact || '',
      description: defaultDescription, // Use derived description
    });
    
    // 3. Switch to Receipts tab and show form
    setActiveTab('receipts');
    setShowForm(true);
    showStatus(`Recording payment for Invoice ${invoice.id.substring(0, 4)}...`);
  };

  const handleViewReceipt = (receipt) => {
    setCurrentReceiptData(receipt);
    setShowReceiptModal(true);
  };


  // --- DOCUMENT VIEW COMPONENTS (omitted for brevity) ---

  const ReceiptDocument = ({ data, onClose }) => {
    const receiptNo = `D000${data.invoiceId ? data.invoiceId.substring(0, 4) : 'TEST'}116`; 
    const receivedBy = "Deviant (Win De)";
    const receiverAddress = "No. (4), Tabinshwehte Road, Dagon East, Yangon, Myanmar";
    const receiverContact = "contact@deviant.com";
    const printDate = formatDate(data.datePaid);

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50 overflow-auto">
        <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl print-container" 
            id="receipt-document"
            style={{
                backgroundImage: 'repeating-radial-gradient(circle at 0 0, transparent 0, #f8f8f8 10px)',
                backgroundColor: '#ffffff'
            }}
        >
          
          {/* Print Styles for the Modal */}
          <style jsx="true">{`
            @media print {
              body * { visibility: hidden; }
              .print-container, .print-container * { visibility: visible; }
              .print-container {
                position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 1cm;
                box-shadow: none; background-color: white; background-image: none !important;
              }
              .no-print { display: none; }
              .receipt-table th, .receipt-table td { padding: 0.25rem 0.5rem; }
              .receipt-border { border: 1px solid black !important; }
            }
          `}</style>
          
          <div className="no-print flex justify-between items-center p-4 border-b">
            <h2 className="text-xl font-bold text-indigo-800">Payment Receipt (View/Print)</h2>
            <div>
              <button 
                onClick={() => window.print()} 
                className="px-4 py-2 mr-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition shadow-md"
              >
                Print Receipt
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-2 rounded-full bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-8 receipt-border border-2 border-gray-900 shadow-xl">
            
            {/* Header: Logo Placeholder and Company Info */}
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-indigo-200">
                
                {/* Logo Placeholder */}
                <div className="flex flex-col items-center justify-center h-20 w-32 bg-indigo-50 border-2 border-indigo-400 rounded-lg p-2">
                    <span className="text-xs font-bold text-indigo-700">YOUR LOGO HERE</span>
                    <span className="text-xs text-indigo-500 italic">Deviant Solutions</span>
                </div>

                {/* Company Info */}
                <div className="text-right text-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Deviant Solutions</h3>
                    <p>{receiverAddress.split(',').join(', ')}</p>
                    <p>Email: {receiverContact}</p>
                    <p>Tel: (95) 123-456-789 (Mock)</p>
                </div>
            </div>

            <h1 className="text-center text-3xl font-extrabold mb-2 uppercase tracking-widest text-indigo-900">
              Cash Receipt
            </h1>
            
            <h2 className="text-center text-xl font-bold mb-6 border-b-4 border-gray-900 pb-2 text-gray-700">RECEIPT</h2>

            {/* Receipt Details Table */}
            <table className="w-full text-sm mb-6 receipt-table">
                <tbody>
                    <tr className="border-b border-gray-300">
                        <th className="text-left font-bold w-1/4 pt-1">Date</th>
                        <td className="w-1/4 pt-1">{printDate}</td>
                        <th className="text-right font-bold w-1/4">Receipt No.</th>
                        <td className="text-right font-mono text-indigo-700 font-bold bg-indigo-50 rounded px-2">{receiptNo}</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                        <th className="text-left font-bold w-1/4 pt-1">Received From</th>
                        <td className="w-1/4 font-extrabold text-gray-900 pt-1">{data.clientName || 'N/A'}</td>
                        <th className="text-right font-bold w-1/4">Amount Received</th>
                        <td className="text-right font-extrabold text-green-700 text-xl">${data.amount.toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                        <th className="text-left font-bold w-1/4 pt-1">Amount (Words)</th>
                        <td className="pt-1 italic text-gray-600" colSpan="3">One Hundred Eighty US Dollars Only (Mock)</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                        <th className="text-left font-bold align-top pt-2">For</th>
                        <td className="pt-2 text-gray-800" colSpan="3">{data.description || 'Payment for services rendered.'}</td>
                    </tr>
                </tbody>
            </table>

            {/* Payment Method and Receiver Info */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-8 border-b pb-4">
                <div>
                    <span className="font-bold inline-block w-20">Paid By</span>: <span className="border-b border-dashed border-gray-400 px-4 font-semibold">Cash</span>
                    <p className="mt-2">
                        <span className="font-bold inline-block w-20">Reference #</span>: <span className="border-b border-dashed border-gray-400 px-4">Kpay # (Mock)</span>
                    </p>
                </div>
                <div className="text-right">
                    <p className="font-bold text-gray-700">Received By:</p>
                    <p className="font-semibold text-gray-900 italic mb-4">{receivedBy}</p>
                    <p className="text-xs text-gray-500">
                        Signature of Receiver
                    </p>
                </div>
            </div>

            {/* Balance Summary */}
            <div className="flex justify-end text-sm">
                <div className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between">
                        <span className="font-medium">Invoice Total:</span>
                        <span className="font-semibold">${data.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-medium">Payment Amount:</span>
                        <span className="font-semibold text-green-700">${data.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed pt-2">
                        <span className="font-bold text-lg">Balance Due:</span>
                        <span className="font-bold text-lg text-red-600">$0.00</span>
                    </div>
                </div>
            </div>

            <div className="text-xs text-gray-500 text-center mt-8 pt-4 border-t">
              Thank you for your business. This receipt confirms full payment against the associated invoice.
            </div>

          </div>
        </div>
      </div>
    );
  };

  // --- Common Form Component (omitted for brevity) ---

  const FormWrapper = ({ title, children, onSubmit, onCancel }) => (
    <div className="p-6 bg-indigo-50 border border-indigo-200 rounded-xl shadow-inner my-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-indigo-800">{title}</h2>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-800">
          <X className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
        {children}
        <div className="flex justify-end space-x-3 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition shadow">
            Cancel
          </button>
          <button type="submit" 
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition shadow-md 
            ${(formAppointment.meetingType === 'Online meeting' && !formAppointment.isConfirmed) ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            disabled={formAppointment.meetingType === 'Online meeting' && !formAppointment.isConfirmed}
            title={formAppointment.meetingType === 'Online meeting' && !formAppointment.isConfirmed ? 'Check availability before saving' : 'Save'}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );

  const InputField = ({ label, name, type = 'text', value, onChange, options = null, disabled = false }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label}</label>
      {options ? (
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'}`}
        >
          {options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required
          step={type === 'number' ? '0.01' : undefined}
          disabled={disabled}
          className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 ${disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'}`}
        />
      )}
    </div>
  );

  const AppointmentForm = ({ formData, handleChange, handleSubmit, handleCancel, handleMockBooking }) => (
    <FormWrapper title="New Appointment" onSubmit={handleSubmit} onCancel={handleCancel}>
      <InputField label="Client Name" name="clientName" value={formData.clientName} onChange={handleChange} />
      <InputField label="Company Name" name="companyName" value={formData.companyName} onChange={handleChange} />
      <InputField label="Address" name="address" value={formData.address} onChange={handleChange} />
      <InputField label="Contact Info (Phone/Email)" name="contact" value={formData.contact} onChange={handleChange} />
      <InputField 
        label="Appointment Title" 
        name="title" 
        value={formData.title} 
        onChange={handleChange} 
        options={['Content Protection', 'Brand Protection', 'Media Management', 'General Inquiry']} 
      />
      
      {/* UPDATED: Meeting Type Selection */}
      <InputField 
        label="Meeting Type" 
        name="meetingType" 
        value={formData.meetingType} 
        onChange={handleChange} 
        options={['In-Person meeting', 'Online meeting']} 
      />

      <div className="grid grid-cols-2 gap-4">
        <InputField label="Date" name="date" type="date" value={formData.date} onChange={handleChange} />
        <InputField label="Time" name="time" type="time" value={formData.time} onChange={handleChange} />
      </div>
      
      {/* NEW: Online Booking Integration (Mock) */}
      {formData.meetingType === 'Online meeting' && (
        <div className="p-3 bg-white rounded-lg border border-indigo-300 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
                <p className="text-sm font-semibold text-indigo-700">
                    Online Meeting Availability
                </p>
                <button
                    type="button"
                    onClick={handleMockBooking}
                    disabled={!formData.date || !formData.time}
                    className={`px-3 py-1 text-xs font-medium text-white rounded-full transition ${(!formData.date || !formData.time) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    Check Availability
                </button>
            </div>
            <p className={`text-xs p-2 rounded-lg font-medium ${
                formData.isConfirmed 
                ? 'bg-green-50 text-green-700 border border-green-300' 
                : formData.date && formData.time 
                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-300'
                    : 'bg-gray-50 text-gray-500'
            }`}>
                {formData.isConfirmed 
                    ? 'Time slot Confirmed via Calendar Mock.' 
                    : formData.date && formData.time
                        ? 'Select date/time and click "Check Availability" to confirm slot.'
                        : 'Enter date and time above to check availability.'
                }
            </p>
        </div>
      )}

      <InputField 
        label="Status" 
        name="status" 
        value={formData.status} 
        onChange={handleChange} 
        options={['Scheduled', 'Completed', 'Cancelled']} 
      />
    </FormWrapper>
  );

  const QuotationForm = ({ formData, handleChange, handleSubmit, handleCancel }) => (
    <FormWrapper title="New Quotation" onSubmit={handleSubmit} onCancel={handleCancel}>
      
      {formData.appointmentId && (
         <p className="text-sm text-blue-600 font-medium bg-blue-50 p-2 rounded-lg">Linked from Appointment ID: {formData.appointmentId.substring(0, 10)}...</p>
      )}

      {/* Client Information Section (Inherited/Editable) */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        <h3 className="text-md font-semibold text-gray-700 border-b pb-1">Client Details (Inherited)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Note: Disabling key fields that are typically fixed from the parent Appointment */}
          <InputField label="Client Name" name="clientName" value={formData.clientName} onChange={handleChange} disabled={!!formData.appointmentId} />
          <InputField label="Company Name" name="companyName" value={formData.companyName} onChange={handleChange} disabled={!!formData.appointmentId} />
          <InputField label="Contact" name="contact" value={formData.contact} onChange={handleChange} />
          <InputField label="Address" name="address" value={formData.address} onChange={handleChange} />
        </div>
      </div>
      
      {/* Service and Terms Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InputField 
          label="Service Type" 
          name="serviceType" 
          value={formData.serviceType} 
          onChange={handleChange} 
          options={['Content Protection', 'Brand Protection', 'Media Management', 'General Service']} 
        />
        <InputField 
          label="Period" 
          name="period" 
          value={formData.period} 
          onChange={handleChange} 
          options={['3 Months', '6 Months', '12 Months', '24 Months', 'One-time']} 
        />
        <InputField 
          label="Payment Term" 
          name="paymentTerm" 
          value={formData.paymentTerm} 
          onChange={handleChange} 
          options={['Net 30', 'Net 60', '50% Upfront', '100% Upfront']} 
        />
      </div>

      <InputField label="Items/Detailed Description" name="items" value={formData.items} onChange={handleChange} />
      
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Total Amount ($)" name="total" type="number" value={formData.total} onChange={handleChange} />
        <InputField label="Date Issued" name="date" type="date" value={formData.date} onChange={handleChange} />
      </div>
      <InputField 
        label="Status" 
        name="status" 
        value={formData.status} 
        onChange={handleChange} 
        options={['Draft', 'Sent', 'Accepted', 'Rejected']} 
      />
    </FormWrapper>
  );

  const InvoiceForm = ({ formData, handleChange, handleSubmit, handleCancel }) => (
    <FormWrapper title="New Invoice" onSubmit={handleSubmit} onCancel={handleCancel}>
      
      {formData.quoteId && (
         <p className="text-sm text-indigo-600 font-medium bg-indigo-50 p-2 rounded-lg">Linked from Quote ID: {formData.quoteId.substring(0, 10)}...</p>
      )}

      {/* Client Information Section (Inherited/Editable) - Disable fixed fields from quote */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
        <h3 className="text-md font-semibold text-gray-700 border-b pb-1">Billing Details (Inherited)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Client Name" name="clientName" value={formData.clientName} onChange={handleChange} disabled={!!formData.quoteId} />
          <InputField label="Company Name" name="companyName" value={formData.companyName} onChange={handleChange} disabled={!!formData.quoteId} />
          <InputField label="Contact" name="contact" value={formData.contact} onChange={handleChange} />
          <InputField label="Address" name="address" value={formData.address} onChange={handleChange} />
        </div>
      </div>

      <InputField label="Items/Description" name="items" value={formData.items} onChange={handleChange} />
      <div className="grid grid-cols-3 gap-4">
        <InputField label="Total Amount ($)" name="total" type="number" value={formData.total} onChange={handleChange} />
        <InputField label="Date Issued" name="date" type="date" value={formData.date} onChange={handleChange} />
        <InputField 
          label="Status" 
          name="status" 
          value={formData.status} 
          onChange={handleChange} 
          options={['Pending', 'Paid']} 
        />
      </div>
    </FormWrapper>
  );

  const ReceiptForm = ({ formData, handleChange, handleSubmit, handleCancel }) => (
    <FormWrapper title="Record Payment Receipt" onSubmit={handleSubmit} onCancel={handleCancel}>
      <InputField label="Client Name" name="clientName" value={formData.clientName} onChange={handleChange} disabled={!!formData.invoiceId} />
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Amount Paid ($)" name="amount" type="number" value={formData.amount} onChange={handleChange} />
        <InputField label="Date Paid" name="datePaid" type="date" value={formData.datePaid} onChange={handleChange} />
      </div>
      <InputField label="Service Description/Period" name="description" value={formData.description} onChange={handleChange} />
      {formData.invoiceId && (
         <p className="text-sm text-indigo-600">Linked to Invoice ID: {formData.invoiceId.substring(0, 10)}...</p>
      )}
    </FormWrapper>
  );

  // --- Main Render ---

  const renderContent = () => {
    switch (activeTab) {
      case 'appointments':
        return renderAppointments();
      case 'quotations':
        return renderQuotations();
      case 'invoices':
        return renderInvoices();
      case 'receipts':
        return renderReceipts();
      default:
        return null;
    }
  };

  const handleShowForm = (tab) => {
    // Reset forms when showing a new one
    setFormAppointment(initialAppointmentState);
    setFormQuotation(initialQuotationState);
    setFormInvoice(initialInvoiceState);
    setFormReceipt(initialReceiptState);
    
    // Switch tabs if necessary
    if (activeTab !== tab) {
      setActiveTab(tab);
    }
    setShowForm(true);
  };

  const getAddButtonText = (tab) => {
    switch (tab) {
      case 'appointments': return 'New Appointment';
      case 'quotations': return 'New Quotation';
      case 'invoices': return 'New Invoice';
      case 'receipts': return 'Record Receipt';
      default: return 'Add Item';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-4 sm:p-6 md:p-8">
      
      {showExportModal && <ExportModal {...exportData} onClose={() => setShowExportModal(false)} />}
      {showReceiptModal && currentReceiptData && <ReceiptDocument data={currentReceiptData} onClose={() => setShowReceiptModal(false)} />}
      {showBookingModal && <MockBookingModal status={bookingStatus} onClose={() => setShowBookingModal(false)} />}


      {/* Header and User Info */}
      <header className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-extrabold text-indigo-900 flex items-center">
          <FileText className="w-8 h-8 mr-3 text-indigo-600" />
          Business Ecosystem Manager
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          User ID: <span className="font-mono text-xs bg-gray-200 p-1 rounded">{userId || 'Loading...'}</span>
        </p>
      </header>
      
      {/* Loading/Status Messages */}
      {(loading || !isAuthReady || !userId) && (
        <div className="flex justify-center items-center h-48 text-indigo-600">
          <Loader2 className="w-8 h-8 animate-spin mr-3" />
          {(!isAuthReady || !userId) ? 'Initializing Authentication & Database...' : 'Loading Ecosystem Data...'}
        </div>
      )}

      {message && (
        <div className={`p-4 mb-4 rounded-xl shadow-md ${messageType === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}

      {/* Main Content (Tabs and Data) */}
      {(isAuthReady && userId && !loading) && (
        <>
          <RemindersBox />
          
          <div className="sm:flex sm:items-center sm:justify-between mb-6">
            <div className="flex space-x-2 border-b-2 border-gray-200 sm:border-b-0">
              <TabButton name="appointments" icon={Calendar} currentTab={activeTab} onClick={setActiveTab} />
              <TabButton name="quotations" icon={ClipboardList} currentTab={activeTab} onClick={setActiveTab} />
              <TabButton name="invoices" icon={FileText} currentTab={activeTab} onClick={setActiveTab} />
              <TabButton name="receipts" icon={Receipt} currentTab={activeTab} onClick={setActiveTab} />
            </div>
            <div className="flex space-x-3 mt-4 sm:mt-0 w-full sm:w-auto">
              <button
                onClick={() => handleExportToSheet(activeTab)}
                className="flex-1 sm:flex-none px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-full shadow-md hover:bg-gray-300 transition duration-300 flex items-center justify-center text-sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </button>
              <button
                onClick={() => handleShowForm(activeTab)}
                className="flex-1 sm:flex-none px-6 py-2 bg-indigo-600 text-white font-semibold rounded-full shadow-lg hover:bg-indigo-700 transition duration-300 flex items-center justify-center text-sm"
              >
                <PlusCircle className="w-5 h-5 mr-2" />
                {getAddButtonText(activeTab)}
              </button>
            </div>
          </div>
          
          {/* Content Area */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-2xl min-h-[50vh]">
            {renderContent()}
          </div>
        </>
      )}
    </div>
  );
};

export default App;