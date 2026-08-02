import { z } from 'zod';

/**
 * Server-safe validation helpers: NO React imports allowed here.
 *
 * This module is imported by Server Components (e.g. Next.js Server Actions validating FormData),
 * where client-only APIs like `createContext` do not exist. The React components live in
 * `./form.tsx`, which is marked 'use client'.
 */

const nonEmpty = 'This field cannot be empty';

export const stringRequired = (): z.ZodString => z.string({ error: nonEmpty }).min(1, { error: nonEmpty });
export const maxLength = (schema: z.ZodString): number => schema.maxLength || 0;
export const minLength = (schema: z.ZodString): number => schema.minLength || 0;
export const isRequired = (schema: z.ZodString): boolean => minLength(schema) > 0;

export type ZodObject = z.ZodObject<any> | z.ZodPipe<any, any>; // z.ZodType<any, any, any>
export type FieldName<S extends ZodObject> = Extract<keyof z.output<S>, string>; // string-only: used as DOM name/id and to index the shape
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

export const getShape = <S extends ZodObject>(schema: S): Record<string, any> =>
    (schema as z.ZodObject<any>).shape || (schema as z.ZodPipe<any, any>).in.shape;

export function create<S extends ZodObject>(
    schema: S,
): {
    register: (
        name: FieldName<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui?: boolean,
    ) => {
        label?: any;
        helperText?: string;
        error?: boolean;
        name: FieldName<S>;
        id: FieldName<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue?: Partial<z.output<S>>[FieldName<S>];
    };
    validate: (formData: FormData) => Validation<S>;
    validationError: (data: MaybeTypeOf<S>, errors: Errors<S>) => Validation<S>;
} {
    if (!getShape(schema)) {
        throw new Error('Invalid schema: only z.object() or z.object().refine() are supported');
    }

    function register(
        name: FieldName<S>,
        data?: MaybeTypeOf<S>,
        errors?: Errors<S>,
        mui: boolean = false,
    ): {
        label?: any;
        helperText?: string;
        error?: boolean;
        name: FieldName<S>;
        id: FieldName<S>;
        required: boolean;
        maxLength: number;
        type: string;
        defaultValue?: Partial<z.output<S>>[FieldName<S>];
    } {
        const field = getShape(schema)[name];
        return {
            name,
            id: name,
            required: isRequired(field),
            maxLength: maxLength(field),
            type: field.isEmail ? 'email' : name.includes('password') ? 'password' : 'text',
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
            /*
             * data is undefined if there are errors
             * Next.js will butcher error object, so we provide something more primitive
             */
            return validationError(rawData, z.flattenError(result.error).fieldErrors as any);
        }

        return { success: true, data: result.data };
    }

    return { register, validate, validationError };
}
