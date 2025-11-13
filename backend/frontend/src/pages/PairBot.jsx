import React from 'react';
import PairForm from '../components/PairForm';

const PairBot = () => {
  return (
    <div className="container-fluid">
      <div className="row justify-content-center">
        <div className="col-12">
          <div className="text-center mb-5">
            <h1 className="display-5 fw-bold text-primary">
              Pair New WhatsApp Bot
            </h1>
            <p className="lead text-muted">
              Connect your WhatsApp account to start using the bot features
            </p>
          </div>
          <PairForm />
        </div>
      </div>
    </div>
  );
};

export default PairBot;
