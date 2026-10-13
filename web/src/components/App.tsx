import React from 'react';
import Chakra from './ChakraProvider';
import Navbar from './Navbar';
import './../styles/global.scss';

const App = () => {
  return (
    <Chakra>
      <Navbar />
    </Chakra>
  );
};

export default App;
