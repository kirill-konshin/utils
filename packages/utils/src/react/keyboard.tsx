'use client';

import { useEffect, createContext, useMemo, useState, Dispatch, SetStateAction, useContext } from 'react';

const isCtrlOrMeta = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

const EVENT = 'keydown';

export type Hotkeys = Record<KeyboardEvent['code'], (e: KeyboardEvent) => void>;

export const HotkeysContext = createContext<{
    enabled: boolean;
    setEnabled: Dispatch<SetStateAction<boolean>>;
}>(null as never);

export const HotkeysProvider = ({ children }) => {
    const [enabled, setEnabled] = useState(true);

    const control = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

    return <HotkeysContext.Provider value={control}>{children}</HotkeysContext.Provider>;
};

export const useHotkeys = (hotkeys: Hotkeys) => {
    const { enabled } = useContext(HotkeysContext);

    useEffect(() => {
        if (typeof document === 'undefined' || !enabled) {
            return;
        }

        const listeners = (e: KeyboardEvent) => {
            if (!isCtrlOrMeta(e)) return;

            for (const [code, callback] of Object.entries(hotkeys)) {
                if (e.code === code) {
                    callback(e);
                    return;
                }
            }
        };

        window.addEventListener(EVENT, listeners, true);

        return () => {
            window.removeEventListener(EVENT, listeners);
        };
    }, [hotkeys, enabled]);
};
