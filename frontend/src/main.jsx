import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './auth';
import { YearProvider } from './YearContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <YearProvider>
                    <App />
                    <Toaster position="top-right" />
                </YearProvider>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
