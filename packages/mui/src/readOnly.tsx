import React, { FC } from 'react';
import { default as Input, InputProps } from '@mui/material/Input';

export const ReadOnly: FC<InputProps & { children: any }> = ({ children, inputProps, ...props }) => (
    <Input {...props} inputComponent={'div' as any} inputProps={{ ...inputProps, children }}></Input>
);
