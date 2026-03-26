import React, { FC, memo } from 'react';
import { default as InputLabel, InputLabelProps } from '@mui/material/InputLabel';

export type FormLabelLegendProps = InputLabelProps;

export const FormLabelLegend: FC<FormLabelLegendProps> = memo(function FormLabelLegend({ children, ...props }) {
    return (
        // sx={(theme) => theme.typography.caption}
        <InputLabel {...props} shrink={true} component={'legend' as any}>
            {children}
        </InputLabel>
    );
});
