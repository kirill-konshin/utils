import React, { FC } from 'react';
import { default as InputLabel, InputLabelProps } from '@mui/material/InputLabel';

export const FormLabelLegend: FC<InputLabelProps> = ({ children, ...props }) => {
    return (
        // sx={(theme) => theme.typography.caption}
        <InputLabel {...props} shrink={true} component={'legend' as any}>
            {children}
        </InputLabel>
    );
};
