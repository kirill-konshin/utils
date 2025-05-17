import { useForm, FormState } from 'react-hook-form';
import { useCallback } from 'react';

export const isFormLoading = (formState: FormState<any>): boolean => formState.isLoading || formState.isSubmitting;

export const useWrappedForm: typeof useForm = (options) => {
    const form = useForm(options);

    const handleSubmit: typeof form.handleSubmit = useCallback(
        (onSubmit, onError) => {
            const wrappedSubmit: typeof onSubmit = async (data) => {
                try {
                    await onSubmit(data);
                } catch (e) {
                    form.setError('root', { type: 'server', message: e.message });
                    console.error('Error submitting form', e);
                }
            };
            return form.handleSubmit(wrappedSubmit, onError);
        },
        [form],
    );

    return { ...form, handleSubmit };
};

/**
 * Issue #3: Submit event still propagates to parent when using portal
 * https://reactjs.org/docs/portals.html#event-bubbling-through-portals
 * Event bubbling goes through React DOM instead of HTML DOM
 * Portals don't have an effect on this one, we need to stop event propagation
 * This should be our default form handling method
 * https://codesandbox.io/s/react-hook-form-nested-portal-6x3fvy?file=/src/App.tsx:1905-2261
 * https://github.com/react-hook-form/react-hook-form/issues/1005#issuecomment-988380981
 */
export const stopPropagation =
    (callback: any) =>
    (e: Event): void => {
        e.stopPropagation();
        e.preventDefault();
        callback(e);
    };
