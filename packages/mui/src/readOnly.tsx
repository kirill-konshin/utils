import React, { FC, memo } from 'react';
import { default as Input, InputProps } from '@mui/material/Input';

export type ReadOnlyProps = InputProps & { children: any };

export const ReadOnly: FC<ReadOnlyProps> = memo(function ReadOnly({ children, inputProps, ...props }) {
    return <Input {...props} inputComponent={'div' as any} inputProps={{ ...inputProps, children }}></Input>;
});
