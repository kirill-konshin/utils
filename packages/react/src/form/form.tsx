import { z } from 'zod';
import { Context, createContext, useContext, useMemo, JSX, FC, memo } from 'react';
import clsx from 'clsx';

const nonEmpty = 'This field cannot be empty';

export const stringRequired = (): z.ZodString => z.string({ error: nonEmpty }).min(1, { error: nonEmpty });
export const maxLength = (schema: z.ZodString): number => schema.maxLength || 0;
export const minLength = (schema: z.ZodString): number => schema.minLength || 0;
export const isRequired = (schema: z.ZodString): boolean => minLength(schema) > 0;

export type ZodObject = z.ZodObject<any> | z.ZodPipe<any, any>; // z.ZodType<any, any, any>
export type MaybeTypeOf<S extends ZodObject> = Partial<z.output<S>>;
export type SafeTypeOf<S extends ZodObject> = z.core.util.SafeParseResult<z.output<S>>['data'];
export type Errors<S extends ZodObject> = z.core.$ZodFlattenedError<z.output<S>>['fieldErrors'];
export type Validation<S extends ZodObject> =
    | {
          success: true; // this is true only if form was validated successfully
          data: SafeTypeOf<S>;
          errors?: never;
      }
    | {
          success: false;
          data?: MaybeTypeOf<S>;
          errors?: Errors<S>;
      };

export const FormContext: Context<{
    schema: ZodObject;
}> = createContext(null as never);

export interface FormProps<S extends ZodObject> {
    schema: S;
    children: any;
}

export const Form: FC<FormProps<any>> = memo(function Form({ schema, children }) {
    const value = useMemo(() => ({ schema }), [schema]);
    return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
});

const getShape = <S extends ZodObject>(schema: S) =>
    (schema as z.ZodObject<any>).shape || (schema as z.ZodPipe<any, any>).in.shape;

export function create<S extends ZodObject>(
    schema: S,
): {
    register: (
        name: keyof z.output<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui?: boolean,
    ) => {
        label?: any;
        helperText?: string;
        error?: boolean;
        name: keyof z.output<S>;
        id: keyof z.output<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue?: Partial<z.output<S>>[keyof z.output<S>];
    };
    validate: (formData: FormData) => Validation<S>;
    validationError: (data: MaybeTypeOf<S>, errors: Errors<S>) => Validation<S>;
} {
    if (!getShape(schema)) {
        throw new Error('Invalid schema: only z.object() or z.object().refine() are supported');
    }

    function register(
        name: keyof z.output<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui: boolean = false,
    ): {
        label?: any;
        helperText?: string;
        error?: boolean;
        name: keyof z.output<S>;
        id: keyof z.output<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue?: Partial<z.output<S>>[keyof z.output<S>];
    } {
        const field = getShape(schema)[name];
        return {
            name,
            id: name,
            required: isRequired(field),
            maxLength: maxLength(field),
            type: field.isEmail ? 'email' : (name as string).includes('password') ? 'password' : 'text',
            defaultValue: data?.[name],
            ...(mui
                ? {
                      label: field.description,
                      helperText: errors?.[name]?.join(', '),
                      error: !!errors?.[name]?.length,
                  }
                : {}),
        };
    }

    function validationError(data: MaybeTypeOf<S>, errors: Errors<S>): Validation<S> {
        return {
            success: false,
            data, // data is undefined if there are errors
            errors, // Next.js will butcher error object, so we provide something more primitive
        };
    }

    function validate(formData: FormData): Validation<S> {
        const rawData = Object.fromEntries(formData) as z.output<S>;
        const result = schema.safeParse(rawData);

        // console.log('Validate result', { error, data, rawData });

        if (!result.success) {
            // data is undefined if there are errors
            // Next.js will butcher error object, so we provide something more primitive
            return validationError(rawData, z.flattenError(result.error).fieldErrors as any);
        }

        return { success: true, data: result.data };
    }

    return { register, validate, validationError };
}

interface FieldProps<S extends ZodObject> {
    children?: any;
    name: keyof z.output<S>;
    errors?: Validation<S>['errors'];
    hint?: string;
    className?: string;
    labelProps?: any;
    [key: string]: any;
}

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
            {errors?.[name as any]?.map((e: string) => (
                <Hint error key={e}>
                    {e}
                </Hint>
            ))}
        </div>
    );
});

export interface HintProps {
    children: any;
    error?: boolean;
}

export const Hint: FC<HintProps> = memo(function Hint({ children, error }) {
    return <div className={`hint ${error ? 'hint-error' : ''}`}>{children}</div>;
});
