# `useFetch`

```tsx
import { useEffect } from 'react';
import { useFetch } from '@kirill.konshin/react';

const [data, actionFn, isPending, error] = useFetch(async (args) => {
    return callToBackend(args);
}, defaultValue);

useEffect(() => {
    actionFn({ id: 1 });
}, []);
```

```tsx
import { useEffect } from 'react';
import { useFetch } from '@kirill.konshin/react';

const dataRef = useRef(data);

const [data, actionFn, isPending, error] = useFetch(async (args) => {
    const data = await callToBackend(args);
    return [...dataRef.current, data];
}, defaultValue);

useEffect(() => {
    dataRef.current = value;
}, [data]);

useEffect(async () => {
    await actionFn({ id: 1 });
    await actionFn({ id: 2 });
    await actionFn({ id: 3 });
}, []);
```

```tsx
import { useEffect } from 'react';
import { useFetch } from '@kirill.konshin/react';

const [data, actionFn, isPending, error] = useFetch(
    // first function has to be synchronous, second can be async
    (args) => async (oldData) => {
        const data = await callToBackend(args);
        return [...oldData, data];
    },
    defaultValue,
);

useEffect(async () => {
    await actionFn({ id: 1 });
    await actionFn({ id: 2 });
    await actionFn({ id: 3 });
}, []);
```
