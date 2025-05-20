'use client';

import { useEffect, createContext, useMemo, useState, Dispatch, SetStateAction, useContext, FC, Context } from 'react';

const isCtrlOrMeta = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

const EVENT = 'keydown';

export type Hotkeys = Record<KeyboardEvent['code'], (e: KeyboardEvent) => void>;

export type HotkeyContextType = {
    enabled: boolean;
    setEnabled: Dispatch<SetStateAction<boolean>>;
};

export const HotkeysContext: Context<HotkeyContextType> = createContext<{
    enabled: boolean;
    setEnabled: Dispatch<SetStateAction<boolean>>;
}>(null as never);

export const HotkeysProvider: FC<any> = ({ children }) => {
    const [enabled, setEnabled] = useState(true);

    const control = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

    return <HotkeysContext.Provider value={control}>{children}</HotkeysContext.Provider>;
};

export const useHotkeys = (hotkeys: Hotkeys): void => {
    const { enabled } = useContext(HotkeysContext);

    useEffect(() => {
        if (typeof document === 'undefined' || !enabled) {
            return;
        }

        const ctrl = new AbortController();

        window.addEventListener(
            EVENT,
            (e: KeyboardEvent) => {
                if (!isCtrlOrMeta(e)) return;

                for (const [code, callback] of Object.entries(hotkeys)) {
                    if (e.code === code) {
                        callback(e);
                        return;
                    }
                }
            },
            { signal: ctrl.signal, capture: true },
        );

        return () => {
            ctrl.abort();
        };
    }, [hotkeys, enabled]);
};
