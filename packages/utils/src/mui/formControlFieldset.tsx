import * as React from 'react';
import { GenericControl, GenericControlProps } from './genericControl';
import { inputClasses } from '@mui/material/Input';

export type FormControlFieldsetProps = GenericControlProps;

export const FormControlFieldset: React.FC<FormControlFieldsetProps> = function FormControlFieldset({
    children,
    sx,
    ...props
}) {
    return (
        <GenericControl
            {...props}
            component="fieldset"
            sx={{
                ...sx,
                [`legend + .${inputClasses.root}`]: {
                    marginTop: 2, //FIXME 16px, hardcoded from @mui/material/Input/Input.js @ 59
                },
            }}
        >
            {children}
        </GenericControl>
    );
};
