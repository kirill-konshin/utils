import React, { type FC, memo } from 'react';
import { default as Box, type BoxProps } from '@mui/material/Box';

export type AppBarOffsetProps = BoxProps;

export const AppBarOffset: FC<AppBarOffsetProps> = memo(function AppBarOffset({ sx, ...props }) {
    return <Box {...props} sx={[({ mixins }) => mixins.toolbar, ...(Array.isArray(sx) ? sx : [sx])]} />;
});
