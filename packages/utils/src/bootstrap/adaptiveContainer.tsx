import React from 'react';
import { Container, ContainerProps } from 'react-bootstrap';
import { useBreakpoint } from './responsiveHelper';

export function AdaptiveContainer({ children, ...props }: ContainerProps) {
    const { isMobile } = useBreakpoint();
    return (
        <Container fluid={isMobile} {...props}>
            {children}
        </Container>
    );
}
