'use client';

import { type Context, createContext, type FC, memo, useContext, useMemo } from 'react';

import clsx from 'clsx';

import { type FieldName, getShape, type Validation, type ZodObject } from './validation';

export const FormContext: Context<{
    schema: ZodObject;
}> = createContext(null as never);

export type FormProps<S extends ZodObject> = {
    schema: S;
    children: any;
};

export const Form: FC<FormProps<any>> = memo(function Form({ schema, children }) {
    const value = useMemo(() => ({ schema }), [schema]);
    return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
});

type FieldProps<S extends ZodObject> = {
    children?: any;
    name: FieldName<S>;
    errors?: Validation<S>['errors'];
    hint?: string;
    className?: string;
    labelProps?: any;
    [key: string]: any;
};

export const Field: FC<FieldProps<any>> = memo(function Field({
    children,
    name,
    errors,
    hint,
    className,
    labelProps,
    ...props
}) {
    const { schema } = useContext(FormContext);
    const { description } = getShape(schema)[name];

    return (
        <div {...props} className={clsx('form-row', className)}>
            {description && (
                <label {...labelProps} htmlFor={name}>
                    {description}
                </label>
            )}
            {children}
            {hint && <Hint>{hint}</Hint>}
            {errors?.[name]?.map((e: string) => (
                <Hint error key={e}>
                    {e}
                </Hint>
            ))}
        </div>
    );
});

export type HintProps = {
    children: any;
    error?: boolean;
};

export const Hint: FC<HintProps> = memo(function Hint({ children, error }) {
    return <div className={`hint ${error ? 'hint-error' : ''}`}>{children}</div>;
});
