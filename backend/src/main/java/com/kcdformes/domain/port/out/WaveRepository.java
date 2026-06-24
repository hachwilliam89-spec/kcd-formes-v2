package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.Wave;

import java.util.Optional;
import java.util.UUID;

public interface WaveRepository {
    void save(UUID gameId, Wave wave);
    Optional<Wave> findById(UUID waveId);
}
