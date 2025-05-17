import { typeToFlattenedError, z, SafeParseReturnType, TypeOf } from 'zod';
import { Context, createContext, useContext, useMemo, JSX } from 'react';
import clsx from 'clsx';

const nonEmpty = 'This field cannot be empty';

export const stringRequired = (): z.ZodString => z.string({ required_error: nonEmpty }).min(1, nonEmpty);
export const maxLength = (schema: z.ZodString): number => schema.maxLength || 0;
export const minLength = (schema: z.ZodString): number => schema.minLength || 0;
export const isRequired = (schema: z.ZodString): boolean => minLength(schema) > 0;

export type ZodObject = z.ZodObject<any> | z.ZodEffects<z.ZodObject<any>>; // z.ZodType<any, any, any>
export type MaybeTypeOf<S extends ZodObject> = Partial<TypeOf<S>>;
export type SafeTypeOf<S extends ZodObject> = SafeParseReturnType<TypeOf<S>, TypeOf<S>>['data'];
export type Errors<S extends ZodObject> = typeToFlattenedError<TypeOf<S>>['fieldErrors'];
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

export const Form = <S extends ZodObject>({ schema, children }: { schema: S; children: any }): JSX.Element => {
    const value = useMemo(() => ({ schema }), [schema]);
    return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
};

const getShape = <S extends ZodObject>(schema: S) =>
    (schema as z.ZodObject<any>).shape || (schema as z.ZodEffects<z.ZodObject<any>>).sourceType().shape;

export function create<S extends ZodObject>(
    schema: S,
): {
    register: (
        name: keyof TypeOf<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui?: boolean,
    ) => {
        label?: any;
        helperText?: string | undefined;
        error?: boolean | undefined;
        name: keyof z.TypeOf<S>;
        id: keyof z.TypeOf<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue: Partial<z.TypeOf<S>>[keyof z.TypeOf<S>] | undefined;
    };
    validate: (formData: FormData) => Validation<S>;
    validationError: (data: MaybeTypeOf<S>, errors: Errors<S>) => Validation<S>;
} {
    if (!getShape(schema)) {
        throw new Error('Invalid schema: only z.object() or z.object().refine() are supported');
    }

    function register(
        name: keyof TypeOf<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui: boolean = false,
    ): {
        label?: any;
        helperText?: string | undefined;
        error?: boolean | undefined;
        name: keyof z.TypeOf<S>;
        id: keyof z.TypeOf<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue: Partial<z.TypeOf<S>>[keyof z.TypeOf<S>] | undefined;
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
        const rawData = Object.fromEntries(formData) as TypeOf<S>;
        const { error, data } = schema.safeParse(rawData);

        // console.log('Validate result', { error, data, rawData });

        if (error) {
            // data is undefined if there are errors
            // Next.js will butcher error object, so we provide something more primitive
            return validationError(rawData, error.flatten().fieldErrors as any);
        }

        return { success: true, data };
    }

    return { register, validate, validationError };
}

function Field<S extends ZodObject>({
    children,
    name,
    errors,
    hint,
    className,
    labelProps,
    ...props
}: {
    children?: any;
    name: keyof TypeOf<S>;
    errors?: Validation<S>['errors'];
    hint?: string;
    className?: string;
    labelProps?: any;
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
}

export function Hint({ children, error }: { children: any; error?: boolean }): JSX.Element {
    return <div className={`hint ${error ? 'hint-error' : ''}`}>{children}</div>;
}
