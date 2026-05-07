import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const YearCtx = createContext(null);

export function YearProvider({ children }) {
    const [year, setYear] = useState(() => {
        const y = localStorage.getItem('rpa_year');
        return y ? Number(y) : new Date().getFullYear();
    });

    // On mount, fetch default year from server (admin-configurable).
    useEffect(() => {
        if (localStorage.getItem('rpa_year')) return;
        api.get('/admin/app-config')
            .then(r => {
                const def = Number(r.data?.default_year);
                if (def && Number.isInteger(def)) {
                    setYear(def);
                    localStorage.setItem('rpa_year', String(def));
                }
            })
            .catch(() => { /* anonymous reads OK; ignore */ });
    }, []);

    const updateYear = (y) => {
        setYear(y);
        localStorage.setItem('rpa_year', String(y));
    };

    return (
        <YearCtx.Provider value={{ year, setYear: updateYear }}>
            {children}
        </YearCtx.Provider>
    );
}

export const useYear = () => useContext(YearCtx);
