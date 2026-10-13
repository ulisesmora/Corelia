import React from 'react';
import Chakra from './ChakraProvider';
import Navbar from './Navbar';
import '../styles/global.scss';

const AppFixed = () => {
  return (
    <Chakra>
      <Navbar forceScrolled />
    </Chakra>
  );
};

export default AppFixed;
