import React, { FC, memo } from 'react';
import { FormControlProps, default as FormControl } from '@mui/material/FormControl';
import { inputClasses } from '@mui/material/Input';

export type GenericControlProps = FormControlProps & { children: any };

export const GenericControl: FC<GenericControlProps> = memo(function GenericControl({ children, sx, ...props }) {
    return (
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
});
