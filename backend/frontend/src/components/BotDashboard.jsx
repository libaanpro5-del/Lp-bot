import React, { useEffect, useState } from 'react';
import { database, listenToBotStatus } from '../firebaseConfig';
import { ref, get } from 'firebase/database';
import StatusCard from './StatusCard';

const BotDashboard = () => {
  const [bots, setBots] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllBots = async () => {
      try {
        const botsRef = ref(database, 'bots');
        const snapshot = await get(botsRef);
        
        if (snapshot.exists()) {
          setBots(snapshot.val());
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching bots:', error);
        setLoading(false);
      }
    };

    fetchAllBots();
  }, []);

  const handleBotUpdate = () => {
    // Force refresh
    const botsRef = ref(database, 'bots');
    get(botsRef).then(snapshot => {
      if (snapshot.exists()) {
        setBots(snapshot.val());
      }
    });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">Loading bot dashboard...</p>
      </div>
    );
  }

  const botEntries = Object.entries(bots);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <i className="fas fa-tachometer-alt me-2 text-primary"></i>
          Bot Dashboard
        </h2>
        <a href="/pair" className="btn btn-primary">
          <i className="fas fa-plus me-2"></i>
          Add New Bot
        </a>
      </div>

      {botEntries.length === 0 ? (
        <div className="text-center py-5">
          <div className="card shadow-sm border-0">
            <div className="card-body py-5">
              <i className="fas fa-robot fa-3x text-muted mb-3"></i>
              <h4 className="text-muted">No Bots Connected</h4>
              <p className="text-muted mb-4">
                Get started by pairing your first WhatsApp account
              </p>
              <a href="/pair" className="btn btn-primary btn-lg">
                <i className="fas fa-link me-2"></i>
                Pair Your First Bot
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="row">
            {botEntries.map(([number, botData]) => (
              <StatusCard 
                key={number}
                bot={{ number, ...botData }}
                onUpdate={handleBotUpdate}
              />
            ))}
          </div>
          
          <div className="row mt-4">
            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-light">
                  <h5 className="mb-0">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Available Commands
                  </h5>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-4">
                      <div className="d-flex align-items-start mb-3">
                        <span className="badge bg-primary me-3 mt-1">.ping</span>
                        <div>
                          <strong>Response Test</strong>
                          <p className="mb-0 text-muted">Check bot response time</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="d-flex align-items-start mb-3">
                        <span className="badge bg-success me-3 mt-1">.tagall</span>
                        <div>
                          <strong>Mention All</strong>
                          <p className="mb-0 text-muted">Tag all group members</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="d-flex align-items-start mb-3">
                        <span className="badge bg-warning me-3 mt-1">.antilink</span>
                        <div>
                          <strong>Anti-link</strong>
                          <p className="mb-0 text-muted">Enable/disable link protection</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default BotDashboard;
