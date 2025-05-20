import React, { FC } from 'react';
import { FormControlProps, default as FormControl } from '@mui/material/FormControl';
import { inputClasses } from '@mui/material/Input';

export type GenericControlProps = FormControlProps & { children: any };

export const GenericControl: FC<GenericControlProps> = ({ children, sx, ...props }) => (
    <FormControl
        variant="standard"
        sx={{
            ...sx,
            [`& .${inputClasses.root}`]: {
                '&:before, &:after': { display: 'none' },
            },
        }}
        {...props}
    >
        {children}
    </FormControl>
);
