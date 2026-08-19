#pragma once
#include <Arduino.h>
#include "config.h"
#include "types.h"

class VotingManager {
public:
    void            reset();
    ConsensusResult addVote(const LoRaPacket& pkt);
    void            tick();   // Call every ~100 ms to expire stale windows
private:
    NodeVote _votes[TOTAL_NODES] = {};
    uint32_t _lastSequence[TOTAL_NODES] = {};
    bool     _seenSequence[TOTAL_NODES] = {};
    uint8_t  _count   = 0;
    uint32_t _winMs   = 0;
    bool     _active  = false;
    bool     _fired   = false;
    void openWindow(uint32_t now);
    void closeWindow();
    ConsensusResult buildConsensus();
};
