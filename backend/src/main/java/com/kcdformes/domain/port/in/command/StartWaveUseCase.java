package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Wave;

import java.util.UUID;

public interface StartWaveUseCase {

    record StartWaveCommand(UUID gameId) {}

    Wave startWave(StartWaveCommand command);
}
