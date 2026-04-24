import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import VPAInput from '@/components/payment/VPAInput';
import AmountInput from '@/components/payment/AmountInput';
import BiometricsPanel from '@/components/payment/BiometricsPanel';
import DecisionResult from '@/components/payment/DecisionResult';
import { useTransaction } from '@/hooks/useTransaction';
import { DEMO_SCENARIOS } from '@/utils/constants';
import { Sparkles } from 'lucide-react';

interface Props {
  onComplete?: () => void;
  onViewDetails?: () => void;
}

export default function PayTab({ onComplete, onViewDetails }: Props) {
  const [step, setStep] = useState<'vpa' | 'amount' | 'result'>('vpa');
  const [userVpa, setUserVpa] = useState('');
  const [payeeVpa, setPayeeVpa] = useState('');
  const [biometrics, setBiometrics] = useState({
    pin_entry_duration_ms: 1500,
    tap_pressure_avg: 0.6,
    copy_paste_amount: false,
  });
  const { status, decision, txnId, error, submit, reset } = useTransaction();

  const handleVpaSubmit = (user: string, payee: string) => {
    setUserVpa(user);
    setPayeeVpa(payee);
    setStep('amount');
  };

  const handlePaySubmit = async (amount: number, remarks: string) => {
    setStep('result');
    await submit({
      user_vpa: userVpa,
      payee_vpa: payeeVpa,
      amount,
      remarks,
      biometrics,
    });
    if (onComplete) onComplete();
  };

  const handleReset = () => {
    reset();
    setStep('vpa');
    setPayeeVpa('');
  };

  const handleScenario = async (scenario: (typeof DEMO_SCENARIOS)[number]) => {
    setUserVpa(scenario.payload.user_vpa);
    setPayeeVpa(scenario.payload.payee_vpa);
    setBiometrics(scenario.payload.biometrics);
    setStep('result');
    await submit({
      user_vpa: scenario.payload.user_vpa,
      payee_vpa: scenario.payload.payee_vpa,
      amount: scenario.payload.amount,
      remarks: scenario.payload.remarks,
      biometrics: scenario.payload.biometrics,
    });
    if (onComplete) onComplete();
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 fade-up">
      {/* Payment card */}
      <motion.div
        layout
        className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/[0.07] rounded-3xl p-8 relative shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {step === 'vpa' && (
            <VPAInput
              key="vpa"
              onSubmit={handleVpaSubmit}
              initialUserVpa={userVpa}
              initialPayeeVpa={payeeVpa}
            />
          )}

          {step === 'amount' && (
            <motion.div
              key="amount"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="space-y-4"
            >
              <AmountInput
                payeeVpa={payeeVpa}
                onSubmit={handlePaySubmit}
                onBack={() => setStep('vpa')}
              />
              <BiometricsPanel value={biometrics} onChange={setBiometrics} />
            </motion.div>
          )}

          {step === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-6"
            >
              <DecisionResult
                status={status}
                decision={decision}
                txnId={txnId}
                error={error}
                onReset={handleReset}
                onViewDetails={onViewDetails}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
