import React from "react";

const  Button = ({text, onClick}) =>{

  return (
    <button className="saito-button-primary" onClick={onClick}>{text}</button>
  );
}

export default Button