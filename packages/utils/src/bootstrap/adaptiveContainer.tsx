import React, { FC } from 'react';
import { Container, ContainerProps } from 'react-bootstrap';
import { useBreakpoint } from './responsiveHelper';

export const AdaptiveContainer: FC<ContainerProps> = function AdaptiveContainer({ children, ...props }) {
    const { isMobile } = useBreakpoint();
    return (
        <Container fluid={isMobile} {...props}>
            {children}
        </Container>
    );
};
