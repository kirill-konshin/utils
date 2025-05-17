import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useAppState(): 'active' | 'background' | 'inactive' | 'unknown' | 'extension' {
    const [appState, setAppState] = useState(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            setAppState(nextAppState);
        });

        return () => {
            subscription.remove();
        };
    }, []);

    return appState;
}
