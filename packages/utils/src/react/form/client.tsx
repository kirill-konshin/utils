'use client';

import { useActionState, useCallback, useState, useTransition } from 'react';
import { create, MaybeTypeOf, Validation } from './form';
import { z } from 'zod';

const FORM_DEBUG = process.env.NEXT_PUBLIC_FORM_DEBUG === 'true';

export function createClient<S extends z.ZodObject<any>>(schema: S) {
    const { validate } = create(schema);

    function useValidationCallback(
        actionFn: (data: FormData) => Promise<Validation<S>>,
    ): (formData: FormData) => Promise<Validation<S>> {
        return useCallback(
            async (formData: FormData) => {
                const clientRes = validate(formData);
                console.log('Client validation', FORM_DEBUG ? 'ignored' : 'active', clientRes);
                if (!clientRes.success && !FORM_DEBUG) return clientRes;

                const serverRes = await actionFn(formData);
                console.log('Server validation', serverRes);
                return serverRes;
            },
            [actionFn],
        );
    }

    function useValidation(
        actionFn: (data: FormData) => Promise<Validation<S>>,
        initialData: MaybeTypeOf<S> = {} as MaybeTypeOf<S>,
    ) {
        const cb = useValidationCallback(actionFn);

        return useActionState<Validation<S>, FormData>(async (_, data) => cb(data), {
            success: false,
            data: initialData,
        });
    }

    function useValidationTransition(
        actionFn: (data: FormData) => Promise<Validation<S>>,
        initialData: MaybeTypeOf<S> = {} as MaybeTypeOf<S>,
    ): [Validation<S>, (formData: FormData) => Promise<Validation<S>>, boolean] {
        const [isPending, startTransition] = useTransition();
        const [state, setState] = useState<Validation<S>>({ success: false, data: initialData });
        const cb = useValidationCallback(actionFn);

        const wrappedCb = useCallback(
            (formData: FormData) => {
                const promise = cb(formData);
                startTransition(() => promise.then(setState));
                return promise;
            },
            [cb, startTransition],
        );

        return [state, wrappedCb, isPending];
    }

    return { useValidation, useValidationTransition };
}
