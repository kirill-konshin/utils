import React, { type FC, memo } from 'react';

import { default as FormControl, type FormControlProps } from '@mui/material/FormControl';
import { inputClasses } from '@mui/material/Input';

export type GenericControlProps = FormControlProps & { children: any };

export const GenericControl: FC<GenericControlProps> = memo(function GenericControl({ children, sx, ...props }) {
    return (
        <FormControl
            variant="standard"
            // `sx` may be an object, a function or an array - MUI merges the array form, later entries win
            sx={[
                ...(Array.isArray(sx) ? sx : [sx]),
                {
                    [`& .${inputClasses.root}`]: {
                        '&:before, &:after': { display: 'none' },
                    },
                },
            ]}
            {...props}
        >
            {children}
        </FormControl>
    );
});
