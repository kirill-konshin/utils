import React, { type FC, memo } from 'react';

import { inputClasses } from '@mui/material/Input';

import { GenericControl, type GenericControlProps } from './genericControl';

export type FormControlFieldsetProps = GenericControlProps;

export const FormControlFieldset: FC<FormControlFieldsetProps> = memo(function FormControlFieldset({
    children,
    sx,
    ...props
}) {
    return (
        <GenericControl
            {...props}
            component="fieldset"
            // `sx` may be an object, a function or an array - MUI merges the array form, later entries win
            sx={[
                ...(Array.isArray(sx) ? sx : [sx]),
                {
                    [`legend + .${inputClasses.root}`]: {
                        marginTop: 2, //FIXME 16px, hardcoded from @mui/material/Input/Input.js @ 59
                    },
                },
            ]}
        >
            {children}
        </GenericControl>
    );
});
