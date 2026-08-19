#include "VotingManager.h"
#include <math.h>
static const char* T = "Voting";

ConsensusResult VotingManager::addVote(const LoRaPacket& pkt) {
    uint32_t now = millis();
    const uint8_t index = pkt.node_id - 1;

    if (pkt.node_id == 0 || pkt.node_id > TOTAL_NODES ||
        (_seenSequence[index] && pkt.sequence <= _lastSequence[index])) {
        log_w("[%s] Unauthorized or replayed Node%d packet", T, pkt.node_id);
        return {false, _count, 0.0f, now};
    }
    _lastSequence[index] = pkt.sequence;
    _seenSequence[index] = true;

    // Reject duplicate vote from same node within current window
    if (_active) {
        for (uint8_t i = 0; i < _count; i++) {
            if (_votes[i].node_id == pkt.node_id && _votes[i].valid) {
                log_d("[%s] Duplicate Node%d ignored", T, pkt.node_id);
                return {false, _count, 0.0f, now};
            }
        }
    }

    if (!_active)                     openWindow(now);
    if (now - _winMs > VOTE_WINDOW_MS) { closeWindow(); openWindow(now); }

    if (_count < TOTAL_NODES) {
        _votes[_count] = {pkt.node_id, pkt.timestamp_ms, pkt.pga, true};
        _count++;
        log_i("[%s] Vote %d/%d  Node%d  PGA=%.4f g",
              T, _count, TOTAL_NODES, pkt.node_id, pkt.pga);
    }

    if (_count >= VOTES_REQUIRED && !_fired) {
        _fired = true;
        ConsensusResult r = buildConsensus();
        log_w("[%s] *** CONSENSUS ALERT ***  %d/%d nodes  net_PGA=%.4f g",
              T, r.votes, TOTAL_NODES, r.network_pga);
        return r;
    }

    return {false, _count, 0.0f, now};
}

void VotingManager::tick() {
    if (!_active) return;
    if (millis() - _winMs > VOTE_WINDOW_MS + 100) {
        log_d("[%s] Window timeout with %d/%d votes", T, _count, VOTES_REQUIRED);
        closeWindow();
    }
}

void VotingManager::reset()       { closeWindow(); _fired = false; }

void VotingManager::openWindow(uint32_t now) {
    _winMs = now; _active = true; _fired = false; _count = 0;
    for (auto& v : _votes) v = {};
    log_d("[%s] Window opened @%lu ms", T, now);
}

void VotingManager::closeWindow() {
    _active = false; _count = 0;
    for (auto& v : _votes) v = {};
}

ConsensusResult VotingManager::buildConsensus() {
    float sumSq = 0.0f;
    uint32_t ts = 0;
    for (uint8_t i = 0; i < _count; i++) {
        if (!_votes[i].valid) continue;
        sumSq += _votes[i].pga * _votes[i].pga;
        if (_votes[i].timestamp_ms > ts) ts = _votes[i].timestamp_ms;
    }
    float net_pga = sqrtf(sumSq / (float)_count);
    return {true, _count, net_pga, ts};
}
