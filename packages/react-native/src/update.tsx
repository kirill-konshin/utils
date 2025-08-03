import * as Updates from 'expo-updates';
import { FC, useEffect, useState } from 'react';
import { Text } from 'react-native';

export const Update: FC<any> = function Update({ children }) {
    //FIXME useUpdates https://blog.expo.dev/feature-preview-updates-js-api-for-expo-updates-3b92beb40dab
    const [updating, setUpdating] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                if (__DEV__) {
                    setUpdating(false);
                    return;
                }

                const update = await Updates.checkForUpdateAsync();

                if (!update.isAvailable) {
                    setUpdating(false);
                    return;
                }

                await Updates.fetchUpdateAsync();
                alert('Update is available. App will reload.');
                await Updates.reloadAsync();
            } catch (error) {
                // You can also add an alert() to see the error message in case of an error when fetching updates.
                alert(`Error fetching latest Expo update: ${error}`);
                setUpdating(false);
            }
        })();
    });

    if (updating) {
        return <Text>Checking for updates ({Updates.channel})...</Text>;
    }

    return children;
};
