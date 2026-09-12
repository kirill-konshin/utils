import { useEffect, useState } from 'react';

import { AppState, type AppStateStatus } from 'react-native';

function normalizeAppState(value: string | null | undefined): AppStateStatus {
    switch (value) {
        case 'active':
        case 'background':
        case 'extension':
        case 'inactive':
            return value;
        default:
            return 'unknown';
    }
}

export function useAppState(): AppStateStatus {
    const [appState, setAppState] = useState(() => normalizeAppState(AppState.currentState));

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            setAppState(normalizeAppState(nextAppState));
        });

        return () => {
            subscription.remove();
        };
    }, []);

    return appState;
}
