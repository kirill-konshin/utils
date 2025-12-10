import React, { FC, memo } from 'react';
import { Container, ContainerProps } from 'react-bootstrap';
import { useBreakpoint } from './responsiveHelper';

export type AdaptiveContainerProps = ContainerProps;

export const AdaptiveContainer: FC<AdaptiveContainerProps> = memo(function AdaptiveContainer({ children, ...props }) {
    const { isMobile } = useBreakpoint();
    return (
        <Container fluid={isMobile} {...props}>
            {children}
        </Container>
    );
});
